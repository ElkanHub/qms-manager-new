-- Phase 4 acceptance: delegation boundary, QA provisioning, SoD, role scoping.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A', 'Org A', gen_random_uuid());

-- Three identities: QA (root), Org-Admin (delegated IT), a target user.
insert into auth.users (id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now()),
  ('bbbbbbbb-0000-0000-0000-000000000002','authenticated','authenticated','oa@a.test','{}',now(),now()),
  ('bbbbbbbb-0000-0000-0000-000000000003','authenticated','authenticated','tg@a.test','{}',now(),now());

insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role)
select id, (select tenant_id from t), (select org_id from t), (select qa_department_id from t), email, 'org', role
from (values
  ('bbbbbbbb-0000-0000-0000-000000000001'::uuid,'qa@a.test','qa'),
  ('bbbbbbbb-0000-0000-0000-000000000002'::uuid,'oa@a.test','org_admin'),
  ('bbbbbbbb-0000-0000-0000-000000000003'::uuid,'tg@a.test',null)
) v(id,email,role);

insert into public.user_roles(user_id, tenant_id, role) values
  ('bbbbbbbb-0000-0000-0000-000000000001',(select tenant_id from t),'qa'),
  ('bbbbbbbb-0000-0000-0000-000000000002',(select tenant_id from t),'org_admin');

-- helper to set a caller context (jwt sub + tenant claim, role authenticated)
-- inline via set_config; reset after each block.

-- === QA can create departments, grant roles, assign HODs (all audited) ===
select set_config('request.jwt.claims', json_build_object(
  'sub','bbbbbbbb-0000-0000-0000-000000000001',
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
set local role authenticated;
select public.create_department('Ops X');
select public.create_department('Ops Y');
select public.grant_role('bbbbbbbb-0000-0000-0000-000000000003','trainer',
  (select id from departments where name='Ops X'));
select public.assign_hod('bbbbbbbb-0000-0000-0000-000000000003',
  (select id from departments where name='Ops X'));
reset role;

select assert((select count(*) from departments where name in ('Ops X','Ops Y')) = 2,
  'QA created two departments');
select assert(app.has_role('bbbbbbbb-0000-0000-0000-000000000003','hod',
  (select id from departments where name='Ops X')), 'target is HOD of Ops X');
-- Role scoping: HOD of X has no HOD authority in Y.
select assert(not app.has_role('bbbbbbbb-0000-0000-0000-000000000003','hod',
  (select id from departments where name='Ops Y')), 'HOD of X is NOT HOD of Y');
select assert(exists(select 1 from audit_trail where action='role.granted'),
  'role grants are audited');
select assert(exists(select 1 from audit_trail where action='department.created' and source='S-DEPARTMENTS'),
  'department creation is audited');

-- === Delegation boundary: Org-Admin cannot grant quality-critical roles ===
select set_config('request.jwt.claims', json_build_object(
  'sub','bbbbbbbb-0000-0000-0000-000000000002',
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
set local role authenticated;
select assert_raises($$select public.grant_role('bbbbbbbb-0000-0000-0000-000000000003','qa')$$,
  'Org-Admin must be refused granting the QA role');
select assert_raises($$select public.grant_role('bbbbbbbb-0000-0000-0000-000000000003','signatory')$$,
  'Org-Admin must be refused granting Signatory');
-- But Org-Admin CAN grant a non-critical role (delegated user-provisioning).
select public.grant_role('bbbbbbbb-0000-0000-0000-000000000003','org_admin');
reset role;
select set_config('request.jwt.claims', null, true);

select assert(app.has_role('bbbbbbbb-0000-0000-0000-000000000003','org_admin'),
  'Org-Admin granted a non-critical role');

-- === Segregation-of-duties primitive (action-level, actor vs record owner) ===
select assert(not app.sod_ok('bbbbbbbb-0000-0000-0000-000000000003',
                             'bbbbbbbb-0000-0000-0000-000000000003'), 'author cannot be own approver');
select assert(app.sod_ok('bbbbbbbb-0000-0000-0000-000000000001',
                         'bbbbbbbb-0000-0000-0000-000000000003'), 'distinct actor passes SoD');
select assert_raises(
  $$select app.enforce_sod('bbbbbbbb-0000-0000-0000-000000000003',
      'bbbbbbbb-0000-0000-0000-000000000003','approve')$$,
  'enforce_sod raises when actor authored the record');
