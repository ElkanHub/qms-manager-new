-- Phase 5 acceptance: break-glass gate (both modes), plane separation, audit visibility.

-- ---- privileged setup (as the migration/connection role) ----
create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A', 'Org A', gen_random_uuid());

insert into auth.users (id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('cccccccc-0000-0000-0000-000000000001','authenticated','authenticated','owner@p.test','{}',now(),now()),
  ('cccccccc-0000-0000-0000-000000000002','authenticated','authenticated','admin@p.test','{}',now(),now()),
  ('cccccccc-0000-0000-0000-000000000003','authenticated','authenticated','qa@a.test','{}',now(),now());

-- platform owner + a scoped platform admin (access_gate)
insert into public.users(id, email, plane, initial_role) values
  ('cccccccc-0000-0000-0000-000000000001','owner@p.test','platform','owner'),
  ('cccccccc-0000-0000-0000-000000000002','admin@p.test','platform','admin');
insert into public.platform_members(user_id, is_owner) values ('cccccccc-0000-0000-0000-000000000001', true);
insert into public.platform_scopes(user_id, scope) values
  ('cccccccc-0000-0000-0000-000000000002','access_gate'),
  ('cccccccc-0000-0000-0000-000000000002','provision_tenants');

-- the tenant's QA (accept a real invite so roles/context are correct)
do $$
declare tok text;
begin
  select token into tok from app.create_invitation('qa@a.test','org','qa',
    (select tenant_id from t),(select org_id from t),(select qa_department_id from t));
  perform public.accept_invitation(tok, 'cccccccc-0000-0000-0000-000000000003', 'qa@a.test');
end $$;

-- ---- gate defaults to org-approved (consent) ----
select assert(app.gate_mode((select tenant_id from t)) = 'org_approved',
  'a tenant''s gate mode defaults to org_approved (consent)');

-- ============ ORG-APPROVED FLOW ============
-- Platform admin requests access → stays PENDING (consent required).
select set_config('request.jwt.claims', json_build_object('sub','cccccccc-0000-0000-0000-000000000002',
  'app_metadata', json_build_object('platform_role','admin'))::text, true);
set local role authenticated;
select public.request_tenant_access((select tenant_id from t), 'support ticket #42');
reset role;

select assert((select status from access_requests where tenant_id=(select tenant_id from t)) = 'pending',
  'org-approved request stays pending until QA decides');
select assert(exists(select 1 from audit_trail
  where chain_key=(select tenant_id from t)::text and action='gate.requested'),
  'the org sees the access request in its own audit trail');
select assert(not app.has_open_gate((select tenant_id from t),'cccccccc-0000-0000-0000-000000000002'),
  'no open gate while pending');

-- A view attempt is refused while the gate is closed.
select set_config('request.jwt.claims', json_build_object('sub','cccccccc-0000-0000-0000-000000000002',
  'app_metadata', json_build_object('platform_role','admin'))::text, true);
set local role authenticated;
select assert_raises(
  $$select public.log_platform_view((select tenant_id from t), 'audit')$$,
  'viewing is refused with no open gate');
reset role;

-- QA grants → session OPENS, audited on the tenant chain.
select set_config('request.jwt.claims', json_build_object('sub','cccccccc-0000-0000-0000-000000000003',
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
set local role authenticated;
select public.decide_access_request(
  (select id from access_requests where tenant_id=(select tenant_id from t)), true, 'approved for support');
reset role;

select assert((select status from access_requests where tenant_id=(select tenant_id from t))='open',
  'QA approval opens the session');
select assert(exists(select 1 from audit_trail
  where chain_key=(select tenant_id from t)::text and action='gate.granted'),
  'the grant is audited on the tenant chain');
select assert(app.has_open_gate((select tenant_id from t),'cccccccc-0000-0000-0000-000000000002'),
  'gate is open after grant');

-- Now the admin can view, and every view is logged on the tenant chain.
select set_config('request.jwt.claims', json_build_object('sub','cccccccc-0000-0000-0000-000000000002',
  'app_metadata', json_build_object('platform_role','admin'))::text, true);
set local role authenticated;
select public.log_platform_view((select tenant_id from t), 'audit trail');
reset role;
select assert(exists(select 1 from audit_trail
  where chain_key=(select tenant_id from t)::text and action='platform.viewed'),
  'every view during an open session is audited and org-visible');

-- ============ SELF-AUTHORIZED FLOW ============
select set_config('request.jwt.claims', json_build_object('sub','cccccccc-0000-0000-0000-000000000001',
  'app_metadata', json_build_object('platform_role','owner'))::text, true);
set local role authenticated;
select public.set_gate_mode((select tenant_id from t), 'self_authorized');
reset role;

select set_config('request.jwt.claims', json_build_object('sub','cccccccc-0000-0000-0000-000000000002',
  'app_metadata', json_build_object('platform_role','admin'))::text, true);
set local role authenticated;
select public.request_tenant_access((select tenant_id from t), 'urgent self-auth');
reset role;
select assert(exists(select 1 from access_requests
  where tenant_id=(select tenant_id from t) and mode='self_authorized' and status='open'),
  'self-authorized request opens immediately');
select assert(exists(select 1 from audit_trail
  where chain_key=(select tenant_id from t)::text and action='gate.opened_self'),
  'self-authorized open is immediately visible in the org audit');

-- ============ PLANE SEPARATION ============
-- Org QA cannot reach a platform control.
select set_config('request.jwt.claims', json_build_object('sub','cccccccc-0000-0000-0000-000000000003',
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
set local role authenticated;
select assert_raises($$select public.platform_provision_tenant('X','X','x@x.test')$$,
  'an org role cannot provision tenants (no platform scope)');
reset role;

-- Platform admin cannot act in an org workflow.
select set_config('request.jwt.claims', json_build_object('sub','cccccccc-0000-0000-0000-000000000002',
  'app_metadata', json_build_object('platform_role','admin'))::text, true);
set local role authenticated;
select assert_raises(
  $$select public.grant_role('cccccccc-0000-0000-0000-000000000003','viewer')$$,
  'a platform role cannot grant org roles (not an org user)');
reset role;
select set_config('request.jwt.claims', null, true);
