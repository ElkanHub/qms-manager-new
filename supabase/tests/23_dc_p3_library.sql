-- DC Phase 3 acceptance: effective-only listing (tenant-wide), in-flight hidden, favorites.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

-- A non-QA user in a different department (so NOT party to QA-dept in-flight docs).
insert into public.departments(id, tenant_id, org_id, name)
  values ('0a000000-0000-0000-0000-0000000000aa',(select tenant_id from t),(select org_id from t),'Ops');
insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at)
  values ('0b000000-0000-0000-0000-0000000000bb','authenticated','authenticated','u@a.test','{}',now(),now());
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role)
  values ('0b000000-0000-0000-0000-0000000000bb',(select tenant_id from t),(select org_id from t),
          '0a000000-0000-0000-0000-0000000000aa','u@a.test','org','viewer');

-- One effective document (QA dept) and one draft-only (QA dept).
create temp table d on commit drop as
  select * from app.create_document((select tenant_id from t),(select org_id from t),
    (select qa_department_id from t),'Effective','SOP-1', gen_random_uuid(), gen_random_uuid());
do $$ begin
  perform app.transition_version((select version_id from d),'in_approval', gen_random_uuid());
  perform app.transition_version((select version_id from d),'approved', gen_random_uuid());
  perform app.make_effective((select version_id from d), gen_random_uuid());
end $$;
create temp table dr on commit drop as
  select * from app.create_document((select tenant_id from t),(select org_id from t),
    (select qa_department_id from t),'Draft', null, gen_random_uuid(), gen_random_uuid());

-- As the Ops viewer: sees the effective doc (tenant-wide, A.4), NOT the in-flight draft.
select set_config('request.jwt.claims', json_build_object('sub','0b000000-0000-0000-0000-0000000000bb',
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
set local role authenticated;
select assert((select count(*) from documents where status='active') = 1,
  'the Master Index lists the effective document tenant-wide');
select assert((select count(*) from documents where id=(select document_id from dr)) = 0,
  'an in-flight draft is not visible to a non-party user (nor listed)');
-- Favorites toggle.
select assert(public.toggle_favorite((select document_id from d)) = true, 'favorite added');
select assert(public.toggle_favorite((select document_id from d)) = false, 'favorite removed');
reset role;
select set_config('request.jwt.claims', null, true);
