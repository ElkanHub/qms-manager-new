-- DC Phase 5 acceptance: inference matrix, abandoned-draft fork, dispatch lock, dispute.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

-- requester + QA users.
insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('11110000-0000-0000-0000-000000000001','authenticated','authenticated','req@a.test','{}',now(),now()),
  ('11110000-0000-0000-0000-000000000002','authenticated','authenticated','qa@a.test','{}',now(),now());
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('11110000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'req@a.test','org','author');
do $$ declare tok text; begin
  select token into tok from app.create_invitation('qa@a.test','org','qa',
    (select tenant_id from t),(select org_id from t),(select qa_department_id from t));
  perform public.accept_invitation(tok,'11110000-0000-0000-0000-000000000002','qa@a.test');
end $$;

-- Two effective documents (change targets) and one draft-only doc.
create temp table docs on commit drop as
  select 'd1'::text lbl, * from app.create_document((select tenant_id from t),(select org_id from t),(select qa_department_id from t),'D1','SOP-1', gen_random_uuid(), gen_random_uuid());
insert into docs select 'd2', * from app.create_document((select tenant_id from t),(select org_id from t),(select qa_department_id from t),'D2','SOP-2', gen_random_uuid(), gen_random_uuid());
do $$ declare r record; begin
  for r in select version_id from docs loop
    perform app.transition_version(r.version_id,'in_approval', gen_random_uuid());
    perform app.transition_version(r.version_id,'approved', gen_random_uuid());
    perform app.make_effective(r.version_id, gen_random_uuid());
  end loop;
end $$;
-- a draft owned by the requester, titled 'MyDraft'
insert into docs select 'draft', * from app.create_document((select tenant_id from t),(select org_id from t),(select qa_department_id from t),'MyDraft', null, '11110000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001');

-- === inference matrix (as the requester) ===
select set_config('request.jwt.claims', json_build_object('sub','11110000-0000-0000-0000-000000000001',
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
set local role authenticated;

select assert((select inferred_type from public.start_intake('new one','Fresh')) = 'NEW_SOP',
  'no target → NEW_SOP');
select assert((select inferred_type from public.start_intake('chg', null, array[(select document_id from docs where lbl='d1')])) = 'CHANGE_SINGLE',
  'one effective target → CHANGE_SINGLE');
select assert((select inferred_type from public.start_intake('chg', null,
    array[(select document_id from docs where lbl='d1'),(select document_id from docs where lbl='d2')])) = 'CHANGE_MULTI',
  'many effective targets → CHANGE_MULTI');
select assert((select inferred_type from public.start_intake('retire', null,
    array[(select document_id from docs where lbl='d1')], true)) = 'RETIRE',
  'target + discontinue → RETIRE');
-- inference keys off EFFECTIVE existence, not any row: a draft-only target → NEW_SOP
select assert((select inferred_type from public.start_intake('x', null,
    array[(select document_id from docs where lbl='draft')])) = 'NEW_SOP',
  'a draft-only target does not misroute as a change');

-- === abandoned-draft fork ===
select assert((select abandoned_draft_id from public.start_intake('resume?','MyDraft'))
    = (select document_id from docs where lbl='draft'),
  'a matching abandoned draft is surfaced for the fork');

-- === dispatch locks the type (immutable after) ===
do $$ declare iid uuid; begin
  select intake_id into iid from public.start_intake('make new','BrandNew');
  perform public.dispatch_intake(iid);
  perform assert((select status from intake_requests where id=iid) = 'dispatched', 'intake dispatched');
  perform assert((select created_document_id from intake_requests where id=iid) is not null, 'NEW_SOP dispatch created a draft document');
  begin
    perform public.dispatch_intake(iid);
    raise exception 'expected lock';
  exception when others then
    if sqlerrm not like '%locked%' then raise; end if;
  end;
end $$;

-- === dispute → QA override (logged) ===
do $$ declare iid uuid; begin
  select intake_id into iid from public.start_intake('really a new doc', null, array[(select document_id from docs where lbl='d1')]);
  perform public.dispute_intake(iid, 'SOP-1 is functionally dead');
  perform assert((select status from intake_requests where id=iid) = 'disputed', 'dispute recorded');
end $$;
reset role;

-- QA resolves the dispute, overriding the type (logged).
select set_config('request.jwt.claims', json_build_object('sub','11110000-0000-0000-0000-000000000002',
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
set local role authenticated;
select public.resolve_intake_dispute(
  (select id from intake_requests where status='disputed' limit 1), 'NEW_SOP', 'agreed, treat as new');
reset role;
select assert(exists(select 1 from audit_trail where action='intake.type_overridden'),
  'QA type override is logged');
select set_config('request.jwt.claims', null, true);
