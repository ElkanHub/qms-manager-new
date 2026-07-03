-- Switchboard v2 acceptance: the categorized catalogue is complete (every
-- module key the app's nav greys on exists; every future module is registered
-- and switchable NOW); toggling an upcoming module is the same real, audited,
-- per-tenant switch the live modules use.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('eeee0000-0000-0000-0000-000000000001','authenticated','authenticated','plat@x.test','{}',now(),now()),
  ('eeee0000-0000-0000-0000-000000000002','authenticated','authenticated','qa@a.test','{}',now(),now());
insert into public.users(id, email, plane, initial_role) values
  ('eeee0000-0000-0000-0000-000000000001','plat@x.test','platform','owner');
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('eeee0000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa');
insert into public.platform_members(user_id, is_owner) values ('eeee0000-0000-0000-0000-000000000001', true);
insert into public.user_roles(user_id, tenant_id, role) values
  ('eeee0000-0000-0000-0000-000000000002',(select tenant_id from t),'qa');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;

-- ============ The catalogue is complete and categorized ============
select assert(
  (select count(*) from modules where key in
     ('library','numbering','controlled_copies','periodic_review','training')) = 5,
  'every module key the app greys on exists in the catalogue');
select assert(
  (select count(*) from modules where key in
     ('ai_audit_insights','capa','deviations','audit_findings','effectiveness_review','regulatory_filings')
     and upcoming) = 6,
  'every future module is registered and flagged upcoming');
select assert(not exists(select 1 from modules where category is null),
  'every module sits in a category');
select assert((select category from modules where key='training') = 'ai',
  'training lives under the AI category');
select assert(not exists(select 1 from modules where upcoming and category = 'document_control'),
  'the live document-control set carries no upcoming flag');

-- ============ Upcoming switches are REAL: default off, platform-toggled, audited ============
select pg_temp.as_user('eeee0000-0000-0000-0000-000000000002');
select assert(not app.module_enabled((select tenant_id from t), 'capa'),
  'an upcoming module defaults OFF for every tenant');
select assert_raises(
  $$select public.set_module((select tenant_id from t), 'capa', true)$$,
  'tenant QA cannot flip the switchboard — platform scope only');

select pg_temp.as_user('eeee0000-0000-0000-0000-000000000001');
select public.set_module((select tenant_id from t), 'capa', true);
select assert(app.module_enabled((select tenant_id from t), 'capa'),
  'the platform flips a future module on for one tenant — the switch is real today');
select assert(exists(select 1 from audit_trail where action='switchboard.module_set'
    and entity_id='capa' and actor_email='plat@x.test'),
  'the flip is audited with its actor');
select public.set_module((select tenant_id from t), 'capa', false);
select assert(not app.module_enabled((select tenant_id from t), 'capa'),
  'and off again — per tenant, reversible');

-- A key outside the catalogue is refused by the FK — no ghost switches.
do $$ begin
  begin
    perform public.set_module((select tenant_id from t), 'jetpacks', true);
    raise exception 'expected fk refusal';
  exception when foreign_key_violation then null; end;
end $$;

select set_config('request.jwt.claims', null, true);
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact after the switchboard session');
