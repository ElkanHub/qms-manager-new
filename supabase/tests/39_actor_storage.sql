-- Actor-never-blank + storage accounting acceptance.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('cccc0000-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now()),
  ('cccc0000-0000-0000-0000-000000000002','authenticated','authenticated','plat@x.test','{}',now(),now());
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('cccc0000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa');
insert into public.users(id, email, plane, initial_role) values
  ('cccc0000-0000-0000-0000-000000000002','plat@x.test','platform','owner');
insert into public.user_roles(user_id, tenant_id, role) values
  ('cccc0000-0000-0000-0000-000000000001',(select tenant_id from t),'qa');
insert into public.platform_members(user_id, is_owner) values ('cccc0000-0000-0000-0000-000000000002', true);

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;

-- ============ The actor always shows ============
do $$ declare eid bigint; begin
  -- (a) no auth context, no explicit actor → System (automatic)
  perform set_config('request.jwt.claims', null, true);
  eid := app.write_audit('test.system_event', null, null, (select tenant_id from t));
  perform assert((select actor_email from audit_trail where id=eid) = 'System (automatic)',
    'a system action records the explicit System actor — never blank');
  -- (b) an authenticated actor with no email passed → directory email resolved
  perform pg_temp.as_user('cccc0000-0000-0000-0000-000000000001');
  eid := app.write_audit('test.user_event', null, null, (select tenant_id from t));
  perform assert((select actor_email from audit_trail where id=eid) = 'qa@a.test',
    'an authenticated action resolves the actor email at write time');
  -- (c) an actor id outside the directory → the id itself, still never blank
  perform set_config('request.jwt.claims', null, true);
  eid := app.write_audit('test.raw_actor', '99999999-9999-9999-9999-999999999999', null, (select tenant_id from t));
  perform assert((select actor_email from audit_trail where id=eid) is not null,
    'even an unknown actor id is recorded, not blanked');
end $$;
select assert(not exists(select 1 from audit_trail
    where chain_key=(select tenant_id from t)::text and actor_email is null),
  'no new entry on this chain has a blank actor');

-- ============ Storage: registration, cap, platform control ============
select pg_temp.as_user('cccc0000-0000-0000-0000-000000000001');
select public.register_stored_file('tenants/a/sop-1.docx', 400000000);
select assert(app.storage_usage((select tenant_id from t)) = 400000000, 'usage is the sum of registered files');

-- default cap is 1 GB → a file that would cross it is refused
select assert_raises(
  $$select public.register_stored_file('tenants/a/sop-2.docx', 700000000)$$,
  'the default 1 GB cap refuses the overflowing upload');

-- Word-only holds in storage too
select assert_raises(
  $$select public.register_stored_file('tenants/a/sop.pdf', 1000)$$,
  'a non-Word object cannot be registered');

-- only the platform sets limits; QA cannot
select assert_raises(
  $$select public.set_tenant_storage_limit((select tenant_id from t), 5000000000)$$,
  'storage limits are platform-controlled');
select pg_temp.as_user('cccc0000-0000-0000-0000-000000000002');
select public.set_tenant_storage_limit((select tenant_id from t), 2000000000);
select pg_temp.as_user('cccc0000-0000-0000-0000-000000000001');
select public.register_stored_file('tenants/a/sop-2.docx', 700000000);
select assert(app.storage_usage((select tenant_id from t)) = 1100000000,
  'a raised cap admits the upload; usage tracks');

select set_config('request.jwt.claims', null, true);
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact (system + user + storage events all chained)');
