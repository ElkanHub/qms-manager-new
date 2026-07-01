-- Phase 2 acceptance: isolation, atomic audited provisioning, immutability.

-- Provision two tenants (as the privileged connection role).
create temp table t on commit drop as
  select 'A'::text as label, * from app.provision_tenant('Tenant A', 'Org A', gen_random_uuid());
insert into t select 'B', * from app.provision_tenant('Tenant B', 'Org B', gen_random_uuid());

-- Atomicity: each provision made tenant + org + exactly one default QA department.
select assert((select count(*) from departments d
               where d.tenant_id = (select tenant_id from t where label='A')) = 1,
  'tenant A has exactly one department (QA) after provisioning');
select assert((select is_default and name = 'QA' from departments d
               where d.tenant_id = (select tenant_id from t where label='A')),
  'the default department is QA');

-- Audit: tenant chain has its 3 creation entries; platform chain recorded the provision.
select assert((select count(*) from audit_trail
               where chain_key = (select tenant_id from t where label='A')::text) = 3,
  'tenant A chain has 3 provisioning audit entries');
select assert((select count(*) from audit_trail
               where chain_key = 'platform' and action = 'platform.tenant_provisioned') = 2,
  'platform chain recorded both tenant provisions');

-- RLS: a user scoped to tenant A sees only tenant A's rows.
select set_config('request.jwt.claims',
  json_build_object('app_metadata',
    json_build_object('tenant_id', (select tenant_id from t where label='A')))::text, true);
set local role authenticated;
select assert((select count(*) from organizations) = 1, 'tenant A sees exactly one org (its own)');
select assert((select count(*) from tenants) = 1,       'tenant A sees exactly one tenant (its own)');
select assert((select count(*) from departments) = 1,   'tenant A sees exactly its own departments');
reset role;

-- Platform user (no tenant claim) has NO default visibility into tenant data (§4.3).
select set_config('request.jwt.claims',
  json_build_object('app_metadata', json_build_object('platform_role', 'owner'))::text, true);
set local role authenticated;
select assert((select count(*) from organizations) = 0,
  'platform user sees zero tenant orgs by default (break-glass only)');
reset role;
select set_config('request.jwt.claims', null, true);

-- tenant_id is immutable.
select assert_raises(
  $$update organizations set tenant_id = gen_random_uuid()
    where id = (select org_id from t where label='A')$$,
  'changing tenant_id must be rejected');

-- tenant_id can never be null on a controlled row.
select assert_raises(
  $$insert into departments(tenant_id, org_id, name)
    values (null, (select org_id from t where label='A'), 'X')$$,
  'null tenant_id must be rejected');
