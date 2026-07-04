-- Roles v2 acceptance: the three-axis model. Department membership in QA
-- confers (and its loss revokes) approval authority via the synced marker;
-- primary roles are hod/org_admin with employee as the baseline; capabilities
-- (signatory, trainer) are per-person grants with the delegation boundary
-- (signatory QA-only); retired keys (approver/author/viewer) are refused
-- everywhere; every change is audited old → new.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('45450000-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now()),
  ('45450000-0000-0000-0000-000000000002','authenticated','authenticated','oa@a.test','{}',now(),now()),
  ('45450000-0000-0000-0000-000000000003','authenticated','authenticated','emp@a.test','{}',now(),now()),
  ('45450000-0000-0000-0000-000000000004','authenticated','authenticated','free@a.test','{}',now(),now()),
  ('45450000-0000-0000-0000-000000000005','authenticated','authenticated','joiner@a.test','{}',now(),now()),
  ('45450000-0000-0000-0000-000000000006','authenticated','authenticated','qjoiner@a.test','{}',now(),now());

insert into public.departments(id, tenant_id, org_id, name) values
  ('0d450000-0000-0000-0000-0000000000aa',(select tenant_id from t),(select org_id from t),'Production'),
  ('0d450000-0000-0000-0000-0000000000bb',(select tenant_id from t),(select org_id from t),'QC');

insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('45450000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa'),
  ('45450000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),'0d450000-0000-0000-0000-0000000000aa','oa@a.test','org','org_admin'),
  ('45450000-0000-0000-0000-000000000003',(select tenant_id from t),(select org_id from t),'0d450000-0000-0000-0000-0000000000aa','emp@a.test','org',null),
  ('45450000-0000-0000-0000-000000000004',(select tenant_id from t),(select org_id from t),null,'free@a.test','org',null);

insert into public.user_roles(user_id, tenant_id, role) values
  ('45450000-0000-0000-0000-000000000001',(select tenant_id from t),'qa'),
  ('45450000-0000-0000-0000-000000000002',(select tenant_id from t),'org_admin');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;

-- ============ Retired keys are refused everywhere ============
select pg_temp.as_user('45450000-0000-0000-0000-000000000001');
set local role authenticated;
select assert_raises($$select public.grant_role('45450000-0000-0000-0000-000000000003','viewer')$$,
  'viewer is retired — viewing is the employee baseline, not a grant');
select assert_raises($$select public.grant_role('45450000-0000-0000-0000-000000000003','author')$$,
  'author is retired — authoring is a universal action');
select assert_raises($$select public.grant_role('45450000-0000-0000-0000-000000000003','approver')$$,
  'approver is retired — approval authority = QA-department membership');
select assert_raises(
  $$select public.org_invite_user('x1@a.test','viewer','0d450000-0000-0000-0000-0000000000aa')$$,
  'invites cannot name a retired role');
select assert_raises(
  $$select public.set_classification_matrix('major', array['qa','approver'])$$,
  'the signing matrix cannot demand a retired role');
select public.set_classification_matrix('major', array['qa','hod']);
reset role;

-- ============ Axis 1: department moves + the QA-membership boundary ============
-- Org-Admin may move people between ordinary departments…
select pg_temp.as_user('45450000-0000-0000-0000-000000000002');
set local role authenticated;
select public.set_user_department('45450000-0000-0000-0000-000000000003','0d450000-0000-0000-0000-0000000000bb');
-- …but never into (or out of) the quality department.
select assert_raises(
  $$select public.set_user_department('45450000-0000-0000-0000-000000000003',(select qa_department_id from t))$$,
  'moving someone INTO the QA department is QA-only');
reset role;

select assert((select department_id from users where id='45450000-0000-0000-0000-000000000003')
  = '0d450000-0000-0000-0000-0000000000bb', 'the ordinary move landed');
select assert(exists(select 1 from audit_trail where action='user.department_changed'
  and entity_id='45450000-0000-0000-0000-000000000003'), 'department moves are audited');

-- QA moves the employee into QA: membership confers approval authority.
select pg_temp.as_user('45450000-0000-0000-0000-000000000001');
set local role authenticated;
select public.set_user_department('45450000-0000-0000-0000-000000000003',(select qa_department_id from t));
reset role;
select assert(app.is_qa('45450000-0000-0000-0000-000000000003'),
  'QA-department membership confers approval authority');
select assert(exists(select 1 from audit_trail where action='qa_membership.granted'
  and entity_id='45450000-0000-0000-0000-000000000003'), 'conferred authority is audited');

-- An Org-Admin cannot move a QA-authority holder anywhere (would strip authority).
select pg_temp.as_user('45450000-0000-0000-0000-000000000002');
set local role authenticated;
select assert_raises(
  $$select public.set_user_department('45450000-0000-0000-0000-000000000003','0d450000-0000-0000-0000-0000000000aa')$$,
  'moving a QA member OUT of the QA department is QA-only');
reset role;

-- QA moves them back out: authority follows membership.
select pg_temp.as_user('45450000-0000-0000-0000-000000000001');
set local role authenticated;
select public.set_user_department('45450000-0000-0000-0000-000000000003','0d450000-0000-0000-0000-0000000000aa');
reset role;
select assert(not app.is_qa('45450000-0000-0000-0000-000000000003'),
  'leaving the QA department revokes approval authority');
select assert(exists(select 1 from audit_trail where action='qa_membership.revoked'
  and entity_id='45450000-0000-0000-0000-000000000003'), 'revoked authority is audited');

-- ============ Axis 2: primary role (employee baseline / hod / org_admin) ============
select pg_temp.as_user('45450000-0000-0000-0000-000000000002');
set local role authenticated;
select public.set_primary_role('45450000-0000-0000-0000-000000000003','hod','0d450000-0000-0000-0000-0000000000aa');
reset role;
select assert(app.has_role('45450000-0000-0000-0000-000000000003','hod','0d450000-0000-0000-0000-0000000000aa'),
  'Org-Admin made the employee HOD/Manager of Production');

select pg_temp.as_user('45450000-0000-0000-0000-000000000002');
set local role authenticated;
select public.set_primary_role('45450000-0000-0000-0000-000000000003','org_admin');
reset role;
select assert(not exists(select 1 from user_roles where user_id='45450000-0000-0000-0000-000000000003' and role='hod'),
  'a person holds ONE primary role — hod cleared on switch');
select assert(app.has_role('45450000-0000-0000-0000-000000000003','org_admin'),
  'the switch to org_admin landed');

select pg_temp.as_user('45450000-0000-0000-0000-000000000002');
set local role authenticated;
select public.set_primary_role('45450000-0000-0000-0000-000000000003','employee');
select assert_raises($$select public.set_primary_role('45450000-0000-0000-0000-000000000004','hod')$$,
  'hod needs a department (target has none, none given)');
select assert_raises($$select public.set_primary_role('45450000-0000-0000-0000-000000000003','signatory')$$,
  'capabilities are not primary roles');
reset role;
select assert(not exists(select 1 from user_roles
  where user_id='45450000-0000-0000-0000-000000000003' and role in ('hod','org_admin')),
  'employee is the baseline — no primary-role rows at all');
select assert(exists(select 1 from audit_trail where action='role.primary_set'),
  'primary-role changes are audited');

-- ============ Axis 3: capabilities (per-person, boundary enforced) ============
select pg_temp.as_user('45450000-0000-0000-0000-000000000002');
set local role authenticated;
select public.set_capability('45450000-0000-0000-0000-000000000003','trainer', true);
select assert_raises(
  $$select public.set_capability('45450000-0000-0000-0000-000000000003','signatory', true)$$,
  'signatory is quality-critical — Org-Admin refused');
reset role;
select assert(app.has_role('45450000-0000-0000-0000-000000000003','trainer'),
  'Org-Admin granted the trainer capability');

select pg_temp.as_user('45450000-0000-0000-0000-000000000001');
set local role authenticated;
select public.set_capability('45450000-0000-0000-0000-000000000003','signatory', true);
reset role;
select assert(app.has_role('45450000-0000-0000-0000-000000000003','signatory'),
  'QA granted the signatory capability to a non-HOD (per-person override)');
select assert(not app.is_qa('45450000-0000-0000-0000-000000000003'),
  'no capability ever confers approval authority');

select pg_temp.as_user('45450000-0000-0000-0000-000000000001');
set local role authenticated;
select public.set_capability('45450000-0000-0000-0000-000000000003','trainer', false);
reset role;
select assert(not app.has_role('45450000-0000-0000-0000-000000000003','trainer'),
  'capabilities are removable per person (an HOD default can be taken away)');
select assert(exists(select 1 from audit_trail where action='capability.granted')
   and exists(select 1 from audit_trail where action='capability.revoked'),
  'capability overrides are audited both ways');

-- ============ Invites: employee baseline + the quality-department boundary ============
select pg_temp.as_user('45450000-0000-0000-0000-000000000002');
set local role authenticated;
select assert_raises(
  $$select public.org_invite_user('q@a.test','employee',(select qa_department_id from t))$$,
  'Org-Admin cannot invite into the QA department');
reset role;

do $$
declare tok text;
begin
  perform pg_temp.as_user('45450000-0000-0000-0000-000000000002');
  select token into tok from public.org_invite_user('joiner@a.test','employee','0d450000-0000-0000-0000-0000000000aa');
  perform set_config('request.jwt.claims', null, true);
  perform public.accept_invitation(tok, '45450000-0000-0000-0000-000000000005', 'joiner@a.test');
end $$;
select assert(not exists(select 1 from user_roles where user_id='45450000-0000-0000-0000-000000000005'),
  'an employee joins with the baseline — no role rows, viewer by default');

do $$
declare tok text;
begin
  perform pg_temp.as_user('45450000-0000-0000-0000-000000000001');
  select token into tok from public.org_invite_user('qjoiner@a.test','employee',(select qa_department_id from t));
  perform set_config('request.jwt.claims', null, true);
  perform public.accept_invitation(tok, '45450000-0000-0000-0000-000000000006', 'qjoiner@a.test');
end $$;
select assert(app.is_qa('45450000-0000-0000-0000-000000000006'),
  'joining the QA department confers approval authority at birth');

-- ============ The SoD guard is untouched by configuration ============
select assert_raises(
  $$select app.enforce_sod('45450000-0000-0000-0000-000000000001','45450000-0000-0000-0000-000000000001','approve')$$,
  'a QA member still cannot approve their own record — SoD is not configurable');

select set_config('request.jwt.claims', null, true);
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact after the roles round');
