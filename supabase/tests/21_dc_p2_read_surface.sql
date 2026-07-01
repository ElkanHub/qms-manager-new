-- DC Phase 2 acceptance: effective-only read, in-flight excluded, renderer swap, A.4 scoping.

create temp table t on commit drop as
  select 'A'::text lbl, * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());
insert into t select 'B', * from app.provision_tenant('Tenant B','Org B', gen_random_uuid());

-- An effective document in tenant A.
create temp table d on commit drop as
  select * from app.create_document(
    (select tenant_id from t where lbl='A'),(select org_id from t where lbl='A'),
    (select qa_department_id from t where lbl='A'),'Effective SOP','SOP-1', gen_random_uuid(), gen_random_uuid());
do $$ begin
  perform app.transition_version((select version_id from d),'in_approval', gen_random_uuid());
  perform app.transition_version((select version_id from d),'approved', gen_random_uuid());
  perform app.make_effective((select version_id from d), gen_random_uuid(), '2026-01-01');
end $$;

-- An in-flight (draft-only) document in tenant A.
create temp table draftdoc on commit drop as
  select * from app.create_document(
    (select tenant_id from t where lbl='A'),(select org_id from t where lbl='A'),
    (select qa_department_id from t where lbl='A'),'Draft SOP', null, gen_random_uuid(), gen_random_uuid());

-- Any tenant-A user reads the effective version (A.4 tenant-wide), default renderer.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(),
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t where lbl='A')))::text, true);
set local role authenticated;
select assert((select revision_number from public.read_document((select document_id from d))) = 0,
  'read surface serves the effective version (rev 00)');
select assert((select renderer from public.read_document((select document_id from d))) = 'ms_online',
  'default renderer is MS online');
-- In-flight document has no effective version → the read surface refuses to serve it.
select assert_raises($$select public.read_document((select document_id from draftdoc))$$,
  'the read surface never serves an in-flight version');
reset role;

-- Renderer swap-test: flip the seam config to internal; read serves via the new
-- renderer with NO core change (only the switch).
insert into public.tenant_modules(tenant_id, module_key, enabled, config)
  values ((select tenant_id from t where lbl='A'),'library', true, '{"renderer":"internal"}'::jsonb);
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(),
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t where lbl='A')))::text, true);
set local role authenticated;
select assert((select renderer from public.read_document((select document_id from d))) = 'internal',
  'swap-test: the renderer is served from config, no core change');
reset role;

-- Cross-tenant read is denied (A.4 is tenant-wide, not cross-tenant).
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(),
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t where lbl='B')))::text, true);
set local role authenticated;
select assert_raises($$select public.read_document((select document_id from d))$$,
  'a user from another tenant cannot read this tenant''s document');
reset role;
select set_config('request.jwt.claims', null, true);
