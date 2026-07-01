-- DC Phase 8 acceptance: pre-check block, retention time-gate, destruction keeps
-- metadata+audit, shared retained tail (supersession + retirement), SoD.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at)
select id,'authenticated','authenticated',id::text||'@a.test','{}',now(),now() from (values
  ('44440000-0000-0000-0000-000000000001'::uuid),('44440000-0000-0000-0000-000000000002'),
  ('44440000-0000-0000-0000-000000000003')) v(id);
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role)
select id,(select tenant_id from t),(select org_id from t),(select qa_department_id from t), id::text,'org','author'
from (values ('44440000-0000-0000-0000-000000000001'::uuid),('44440000-0000-0000-0000-000000000002'),
  ('44440000-0000-0000-0000-000000000003')) v(id);
insert into public.user_roles(user_id, tenant_id, role) values
  ('44440000-0000-0000-0000-000000000002',(select tenant_id from t),'qa'),
  ('44440000-0000-0000-0000-000000000003',(select tenant_id from t),'qa');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true); $$;
create or replace function pg_temp.mkeff(p_title text) returns uuid language plpgsql as $$
declare doc uuid; ver uuid; begin
  select document_id, version_id into doc, ver from app.create_document((select tenant_id from t),
    (select org_id from t),(select qa_department_id from t), p_title, null, gen_random_uuid(), gen_random_uuid());
  perform app.transition_version(ver,'in_approval', gen_random_uuid());
  perform app.transition_version(ver,'approved', gen_random_uuid());
  perform app.make_effective(ver, gen_random_uuid());
  return doc; end $$;

-- === Happy retirement → retention hold → time-gated destruction ===
do $$ declare doc uuid; ret uuid; ver uuid;
begin
  doc := pg_temp.mkeff('To Retire');
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000001');            -- requester
  ret := public.request_retirement(doc, 'process discontinued');
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000002');            -- QA
  perform public.approve_retirement(ret);
  perform public.withdraw_retirement(ret);
  perform assert((select status from documents where id=doc)='retired', 'document is retired');
  select id into ver from document_versions where document_id=doc and status='retained';
  perform assert(ver is not null, 'the version is in the retention hold');

  -- time-gate: cannot destroy before retention elapses
  begin perform public.destroy_version(ver,'shred','done'); raise exception 'expected time-gate';
  exception when others then if sqlerrm not like '%time-gate%' then raise; end if; end;

  -- make retention elapsed, then destroy
  update document_versions set retention_until = now() - interval '1 day' where id=ver;
  perform public.destroy_version(ver, 'secure-shred', 'retention elapsed');
  perform assert((select status from document_versions where id=ver)='destroyed', 'version destroyed after retention');
  perform assert((select content_ref from document_versions where id=ver) is null, 'content removed on destruction');
  perform assert((select count(*) from document_versions where id=ver)=1, 'metadata row retained (never a true delete)');
end $$;
select assert(exists(select 1 from audit_trail where action='version.destroyed'), 'destruction is logged (audit retained)');

-- === Pre-check blocks approval when an open change targets the document ===
do $$ declare doc uuid; ret uuid;
begin
  doc := pg_temp.mkeff('Depended On');
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000001');
  perform public.create_change(array[doc], 'open change keeps it alive');   -- open CC targets doc
  ret := public.request_retirement(doc, 'try to retire');
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000002');
  begin perform public.approve_retirement(ret); raise exception 'expected precheck block';
  exception when others then if sqlerrm not like '%pre-checks failed%' then raise; end if; end;
end $$;

-- === Supersession path also lands in `retained` and shares the destruction gate ===
do $$ declare doc uuid; v2 uuid; oldv uuid;
begin
  doc := pg_temp.mkeff('Superseded Doc');
  v2 := app.add_revision(doc, gen_random_uuid());
  perform app.transition_version(v2,'in_approval', gen_random_uuid());
  perform app.transition_version(v2,'approved', gen_random_uuid());
  perform app.make_effective(v2, gen_random_uuid());                          -- predecessor → superseded
  perform assert(public.start_retention_holds() >= 1, 'superseded versions enter the retention hold');
  select id into oldv from document_versions where document_id=doc and status='retained';
  perform assert(oldv is not null, 'the superseded version is now retained (shared tail)');
  update document_versions set retention_until = now() - interval '1 day' where id=oldv;
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000002');
  perform public.destroy_version(oldv,'shred','retention elapsed');
  perform assert((select status from document_versions where id=oldv)='destroyed', 'a superseded-then-retained version can be destroyed via the same gate');
end $$;

-- === SoD: a QA who requested the retirement cannot approve it ===
do $$ declare doc uuid; ret uuid;
begin
  doc := pg_temp.mkeff('Self Retire');
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000003');            -- qa2 requests
  ret := public.request_retirement(doc,'mine');
  begin perform public.approve_retirement(ret); raise exception 'expected SoD';
  exception when others then if sqlerrm not like '%segregation of duties%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims', null, true);
