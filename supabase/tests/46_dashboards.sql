-- Configurable dashboards acceptance: design authority lies with QA (Org-Admin
-- refused); shape is validated; base and per-department scopes upsert
-- independently; reset (null) removes an override; everything audited old → new.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('46460000-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now()),
  ('46460000-0000-0000-0000-000000000002','authenticated','authenticated','oa@a.test','{}',now(),now());
insert into public.departments(id, tenant_id, org_id, name) values
  ('0d460000-0000-0000-0000-0000000000aa',(select tenant_id from t),(select org_id from t),'Production');
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('46460000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa'),
  ('46460000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),'0d460000-0000-0000-0000-0000000000aa','oa@a.test','org','org_admin');
insert into public.user_roles(user_id, tenant_id, role) values
  ('46460000-0000-0000-0000-000000000001',(select tenant_id from t),'qa'),
  ('46460000-0000-0000-0000-000000000002',(select tenant_id from t),'org_admin');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;

-- Design authority lies with QA — an Org-Admin is refused.
select pg_temp.as_user('46460000-0000-0000-0000-000000000002');
set local role authenticated;
select assert_raises(
  $$select public.set_dashboard_config('admin', null, '[{"key":"quality_kpis"}]'::jsonb)$$,
  'dashboard design is QA-only');
reset role;

-- QA sets the base admin dashboard.
select pg_temp.as_user('46460000-0000-0000-0000-000000000001');
set local role authenticated;
select public.set_dashboard_config('admin', null,
  '[{"key":"quality_kpis","size":"full"},{"key":"recent_audit","size":"half"}]'::jsonb);

-- Shape validation: not an array / element without key / bad size / bad audience.
select assert_raises(
  $$select public.set_dashboard_config('admin', null, '{"key":"x"}'::jsonb)$$,
  'widgets must be an array');
select assert_raises(
  $$select public.set_dashboard_config('admin', null, '[{"size":"full"}]'::jsonb)$$,
  'each widget needs a key');
select assert_raises(
  $$select public.set_dashboard_config('admin', null, '[{"key":"a","size":"huge"}]'::jsonb)$$,
  'size must be full or half');
select assert_raises(
  $$select public.set_dashboard_config('manager', null, '[{"key":"a"}]'::jsonb)$$,
  'audience must be admin or employee');
select assert_raises(
  $$select public.set_dashboard_config('admin', '0d460000-9999-0000-0000-0000000000ff', '[{"key":"a"}]'::jsonb)$$,
  'unknown department refused');

-- Department override upserts independently of the base; updates overwrite.
select public.set_dashboard_config('employee', '0d460000-0000-0000-0000-0000000000aa',
  '[{"key":"my_training"}]'::jsonb);
select public.set_dashboard_config('employee', '0d460000-0000-0000-0000-0000000000aa',
  '[{"key":"my_training"},{"key":"dept_documents"}]'::jsonb);
reset role;

select assert((select count(*) from dashboard_configs) = 2,
  'one base admin config + one Production employee override');
select assert((select jsonb_array_length(widgets) from dashboard_configs
               where audience='employee' and department_id='0d460000-0000-0000-0000-0000000000aa') = 2,
  'the department override was updated in place');
select assert(exists(select 1 from audit_trail where action='dashboard.config_set'
               and old_value is not null and new_value is not null),
  'config updates are audited old → new');

-- Reset: the department returns to inheriting the base.
select pg_temp.as_user('46460000-0000-0000-0000-000000000001');
set local role authenticated;
select public.set_dashboard_config('employee', '0d460000-0000-0000-0000-0000000000aa', null);
reset role;
select assert((select count(*) from dashboard_configs
               where audience='employee' and department_id is not null) = 0,
  'reset removed the department override');
select assert(exists(select 1 from audit_trail where action='dashboard.config_reset'),
  'resets are audited');

select set_config('request.jwt.claims', null, true);
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact after the dashboard round');
