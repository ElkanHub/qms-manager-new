-- SOP Library v2 acceptance: per-document locks with TIMED grants (expiry
-- closes the door by itself), full-read default preserved, every step audited
-- including restricted reads and denied attempts; categories as tenant data;
-- lock enforcement is CORE (module off never weakens it).

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('dddd0000-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now()),
  ('dddd0000-0000-0000-0000-000000000002','authenticated','authenticated','prod@a.test','{}',now(),now());
insert into public.departments(id, tenant_id, org_id, name, code)
  values ('0d000000-0000-0000-0000-0000000000aa',(select tenant_id from t),(select org_id from t),'Production','PROD');
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('dddd0000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa'),
  ('dddd0000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),'0d000000-0000-0000-0000-0000000000aa','prod@a.test','org','author');
insert into public.user_roles(user_id, tenant_id, role) values
  ('dddd0000-0000-0000-0000-000000000001',(select tenant_id from t),'qa');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;
-- an effective document owned by the QA department (so the Production user is out-of-department)
create temp table wd on commit drop as
select doc from (
  select document_id as doc, version_id as ver from app.create_document((select tenant_id from t),
    (select org_id from t),(select qa_department_id from t),'Secret QC Method', null, gen_random_uuid(), gen_random_uuid())
) x;
do $$ declare v uuid; begin
  select id into v from document_versions where document_id=(select doc from wd);
  perform app.transition_version(v,'in_approval', gen_random_uuid());
  perform app.transition_version(v,'approved', gen_random_uuid());
  perform app.make_effective(v, gen_random_uuid());
end $$;

-- ============ Full-read default: anyone reads anything effective (A.4) ============
select pg_temp.as_user('dddd0000-0000-0000-0000-000000000002');
select assert((select count(*) from public.read_document((select doc from wd))) = 1,
  'default: effective content is readable tenant-wide');

-- ============ QA locks → out-of-department read refused AND logged ============
select pg_temp.as_user('dddd0000-0000-0000-0000-000000000001');
select assert_raises($$select public.lock_document((select doc from wd), '')$$, 'lock needs a reason');
select public.lock_document((select doc from wd), 'proprietary QC method — restricted');
select pg_temp.as_user('dddd0000-0000-0000-0000-000000000002');
select assert((select count(*) from public.read_document((select doc from wd))) = 0,
  'locked: out-of-department read returns nothing');
select assert(exists(select 1 from audit_trail where action='read_access.denied_attempt'
    and actor_email='prod@a.test'), 'the denied attempt is logged WITH its actor');

-- non-QA cannot lock/unlock/grant
select assert_raises($$select public.lock_document((select doc from wd), 'x')$$, 'locking is QA only');
select assert_raises($$select public.unlock_document((select doc from wd))$$, 'unlocking is QA only');

-- QA and the owning department still read a locked document
select pg_temp.as_user('dddd0000-0000-0000-0000-000000000001');
select assert((select count(*) from public.read_document((select doc from wd))) = 1,
  'QA reads a locked document (and it is logged as a restricted read)');
select assert(exists(select 1 from audit_trail where action='document.restricted_read'
    and actor_email='qa@a.test'), 'restricted reads are always logged');

-- ============ Request → timed grant → read → expiry closes the door ============
select pg_temp.as_user('dddd0000-0000-0000-0000-000000000002');
select assert_raises($$select public.request_read_access((select doc from wd), '')$$, 'purpose required');
create temp table req on commit drop as
  select public.request_read_access((select doc from wd), 'need to cross-reference the QC method') as id;
select assert_raises($$select public.request_read_access((select doc from wd), 'again')$$,
  'one open request at a time');
select assert_raises($$select public.grant_read_access((select id from req), 4)$$,
  'the requester cannot grant themselves access');

select pg_temp.as_user('dddd0000-0000-0000-0000-000000000001');
select assert_raises($$select public.grant_read_access((select id from req), 0)$$,
  'the grant must carry a real time limit');
select public.grant_read_access((select id from req), 4);

select pg_temp.as_user('dddd0000-0000-0000-0000-000000000002');
select assert((select count(*) from public.read_document((select doc from wd))) = 1,
  'a live grant opens the document');
select assert(exists(select 1 from audit_trail where action='document.restricted_read'
    and actor_email='prod@a.test'), 'the granted read is logged with the reader');

-- expiry: push the grant into the past → access closes by itself, no scheduler
update public.read_access_requests set expires_at = now() - interval '1 minute' where id=(select id from req);
select assert((select count(*) from public.read_document((select doc from wd))) = 0,
  'past the time limit the access locks again by itself');

-- a fresh round: request → grant → QA revokes early (audited)
create temp table req2 on commit drop as
  select public.request_read_access((select doc from wd), 'follow-up work') as id;
select pg_temp.as_user('dddd0000-0000-0000-0000-000000000001');
select public.grant_read_access((select id from req2), 24);
select public.revoke_read_access((select id from req2), 'work concluded early');
select pg_temp.as_user('dddd0000-0000-0000-0000-000000000002');
select assert((select count(*) from public.read_document((select doc from wd))) = 0,
  'a revoked grant no longer opens the document');

-- decline path carries its reason
create temp table req3 on commit drop as
  select public.request_read_access((select doc from wd), 'one more look') as id;
select pg_temp.as_user('dddd0000-0000-0000-0000-000000000001');
select public.decline_read_access((select id from req3), 'no business need shown');
select assert(exists(select 1 from audit_trail where action='read_access.declined'
    and reason like '%business need%'), 'declines are audited with the reason');

-- ============ Unlock restores tenant-wide read; module state never mattered ============
update public.tenant_modules set enabled=false
  where tenant_id=(select tenant_id from t) and module_key='library';
select public.unlock_document((select doc from wd));
select pg_temp.as_user('dddd0000-0000-0000-0000-000000000002');
select assert((select count(*) from public.read_document((select doc from wd))) = 1,
  'unlocked again: tenant-wide read is back (library module off — locks are core, reading is core)');

-- ============ Categories: tenant taxonomy as data, QA-managed ============
select assert_raises($$select public.upsert_library_category('Cleaning')$$,
  'categories are QA/org-admin managed');
select pg_temp.as_user('dddd0000-0000-0000-0000-000000000001');
do $$ declare c1 uuid; c2 uuid; begin
  c1 := public.upsert_library_category('Cleaning', 1);
  c2 := public.upsert_library_category('Production', 2);
  perform public.set_document_categories((select doc from wd), array[c1, c2]);
  perform assert((select count(*) from document_categories where document_id=(select doc from wd)) = 2,
    'a document sits in its categories');
  perform public.set_document_categories((select doc from wd), array[c2]);
  perform assert((select count(*) from document_categories where document_id=(select doc from wd)) = 1,
    'recategorizing replaces the set');
  perform public.delete_library_category(c1);
  c1 := public.upsert_library_category('cleaning', 3);  -- name freed for reuse
end $$;

select set_config('request.jwt.claims', null, true);
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact after the full lock/grant/category story');
