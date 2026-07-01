-- Phase 6 acceptance: the swap-test (headline), in-flight isolation, org read-only,
-- connectability, and audited switchboard actions.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A', 'Org A', gen_random_uuid());

-- a scoped platform admin (switchboard) and the tenant's QA
insert into auth.users (id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('dddddddd-0000-0000-0000-000000000002','authenticated','authenticated','admin@p.test','{}',now(),now()),
  ('dddddddd-0000-0000-0000-000000000003','authenticated','authenticated','qa@a.test','{}',now(),now());
insert into public.users(id, email, plane, initial_role) values
  ('dddddddd-0000-0000-0000-000000000002','admin@p.test','platform','admin');
insert into public.platform_scopes(user_id, scope) values
  ('dddddddd-0000-0000-0000-000000000002','switchboard');
do $$
declare tok text;
begin
  select token into tok from app.create_invitation('qa@a.test','org','qa',
    (select tenant_id from t),(select org_id from t),(select qa_department_id from t));
  perform public.accept_invitation(tok, 'dddddddd-0000-0000-0000-000000000003', 'qa@a.test');
end $$;

-- ============ THE SWAP-TEST ============
-- Module ABSENT → the flow completes using the default (goes effective).
select assert(app.demo_effective_flow((select tenant_id from t)) = 'effective',
  'swap-test: with training off/absent the flow completes via the default (effective)');

-- Flip the switch ON (only the switch changes — no code change).
insert into public.tenant_modules(tenant_id, module_key, enabled, config)
  values ((select tenant_id from t), 'training', true, '{}'::jsonb);
select assert(app.demo_effective_flow((select tenant_id from t)) = 'pending_training',
  'swap-test: with training on the flow defers to the module (pending until met)');

-- ============ IN-FLIGHT SWITCH POLICY ============
-- A flow engages the seam (snapshots ON), then the module is turned OFF.
do $$
declare v_flow uuid; v_engaged jsonb; v_live jsonb;
begin
  v_flow := app.begin_seam_flow((select tenant_id from t), 'training');
  update public.tenant_modules set enabled = false
    where tenant_id=(select tenant_id from t) and module_key='training';
  v_engaged := app.resolve_training((select tenant_id from t), v_flow);   -- uses snapshot
  v_live    := app.resolve_training((select tenant_id from t), null);     -- uses live setting
  perform assert(v_engaged->>'source' = 'module',
    'in-flight flow keeps the old (engaged) setting after the switch');
  perform assert(v_live->>'source' = 'default',
    'a new flow started after the switch uses the new setting');
  perform app.close_seam_flow(v_flow);
end $$;

-- Deferral really tracks the module answer: enable + threshold met → effective.
update public.tenant_modules set enabled = true, config = '{"assume_met":true}'::jsonb
  where tenant_id=(select tenant_id from t) and module_key='training';
select assert(app.demo_effective_flow((select tenant_id from t)) = 'effective',
  'when the module reports the threshold met, the flow goes effective');

-- ============ CONNECTABILITY: no-audit module can't be enabled ============
insert into public.modules(key, label, description, audit_compliant) values ('badmod','Bad','',false);
select assert_raises(
  $$insert into tenant_modules(tenant_id, module_key, enabled)
    values ((select tenant_id from t), 'badmod', true)$$,
  'a non-audit-compliant module cannot be enabled');

-- ============ CORE GUARDS AREN'T IN THE REGISTRY ============
-- Only registered modules can be toggled; there is no 'audit'/guard key to flip.
select assert_raises(
  $$insert into tenant_modules(tenant_id, module_key, enabled)
    values ((select tenant_id from t), 'audit', true)$$,
  'guards are not modules — no such switchboard key exists');

-- ============ SWITCHBOARD RPC: platform-only, audited ============
select set_config('request.jwt.claims', json_build_object('sub','dddddddd-0000-0000-0000-000000000002',
  'app_metadata', json_build_object('platform_role','admin'))::text, true);
set local role authenticated;
select public.set_module((select tenant_id from t), 'training', true, '{"assume_met":true}'::jsonb);
reset role;
select assert(exists(select 1 from audit_trail where action='switchboard.module_set'),
  'switchboard changes are audited');

-- Org cannot flip the switch (read-only for the org).
select set_config('request.jwt.claims', json_build_object('sub','dddddddd-0000-0000-0000-000000000003',
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
set local role authenticated;
select assert_raises($$select public.set_module((select tenant_id from t),'training',false,'{}'::jsonb)$$,
  'an org user cannot flip the switchboard');
-- …but the org CAN file a request-a-change.
select public.request_module_change('training', false, 'we do not need training gating');
reset role;
select set_config('request.jwt.claims', null, true);

select assert(exists(select 1 from module_change_requests where module_key='training'),
  'org can file a module change request');
select assert(exists(select 1 from audit_trail where action='module.change_requested'),
  'module change requests are audited');
