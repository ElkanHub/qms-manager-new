-- Phase 7: whole-substrate sweeps — isolation, immutability, audit-view scoping.

-- ============ ISOLATION SWEEP ============
-- Every table that carries tenant_id must have RLS enabled. None may be unprotected.
select assert(
  (select count(*) from app.tenant_scoped_tables() where not rls_enabled) = 0,
  'no tenant-scoped table is missing RLS');
-- The audit trail itself has RLS (default-deny until the Phase 7 viewing policies).
select assert(
  (select relrowsecurity from pg_class where relname='audit_trail'),
  'audit_trail has RLS enabled');

-- ============ IMMUTABILITY / CHAIN SWEEP ============
create temp table t on commit drop as
  select 'A'::text label, * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());
insert into t select 'B', * from app.provision_tenant('Tenant B','Org B', gen_random_uuid());

select assert((select bool_and(ok) from app.verify_audit_chain(null)),
  'all audit chains verify after cross-phase activity');

-- ============ AUDIT COMPLETENESS (representative) ============
select assert(exists(select 1 from audit_trail where action='tenant.provisioned'),
  'provisioning produced its audit entries');
select assert(exists(select 1 from audit_trail where action='platform.tenant_provisioned' and tenant_id is null),
  'platform-chain oversight entry recorded');

-- ============ AUDIT-VIEW SCOPING ============
insert into auth.users (id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('eeeeeeee-0000-0000-0000-000000000002','authenticated','authenticated','admin@p.test','{}',now(),now()),
  ('eeeeeeee-0000-0000-0000-000000000003','authenticated','authenticated','qa@a.test','{}',now(),now());
insert into public.users(id, email, plane, initial_role) values
  ('eeeeeeee-0000-0000-0000-000000000002','admin@p.test','platform','admin');
do $$
declare tok text;
begin
  select token into tok from app.create_invitation('qa@a.test','org','qa',
    (select tenant_id from t where label='A'),(select org_id from t where label='A'),
    (select qa_department_id from t where label='A'));
  perform public.accept_invitation(tok, 'eeeeeeee-0000-0000-0000-000000000003', 'qa@a.test');
end $$;

-- Org QA of A sees ONLY tenant A's audit (no tenant B, no platform-chain entries).
select set_config('request.jwt.claims', json_build_object('sub','eeeeeeee-0000-0000-0000-000000000003',
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t where label='A')))::text, true);
set local role authenticated;
select assert((select count(*) from audit_trail) > 0, 'QA sees its own org audit');
select assert(
  (select count(*) from audit_trail
   where tenant_id is distinct from (select tenant_id from t where label='A')) = 0,
  'QA sees nothing outside its own tenant');
reset role;

-- Platform admin WITHOUT a gate: sees platform-chain entries, zero tenant entries.
select set_config('request.jwt.claims', json_build_object('sub','eeeeeeee-0000-0000-0000-000000000002',
  'app_metadata', json_build_object('platform_role','admin'))::text, true);
set local role authenticated;
select assert((select count(*) from audit_trail where tenant_id is not null) = 0,
  'platform admin sees no tenant audit by default (break-glass only)');
select assert((select count(*) from audit_trail where tenant_id is null) > 0,
  'platform admin sees platform-chain oversight entries');
reset role;

-- Open a break-glass session to A → the platform admin can now see A's audit.
insert into public.access_requests(tenant_id, requested_by, purpose, mode, status, opened_at, expires_at)
  values ((select tenant_id from t where label='A'),'eeeeeeee-0000-0000-0000-000000000002',
          'audit review','self_authorized','open', now(), now()+interval '1 hour');
select set_config('request.jwt.claims', json_build_object('sub','eeeeeeee-0000-0000-0000-000000000002',
  'app_metadata', json_build_object('platform_role','admin'))::text, true);
set local role authenticated;
select assert(
  (select count(*) from audit_trail where tenant_id = (select tenant_id from t where label='A')) > 0,
  'with an open gate, the platform admin can view the tenant''s audit');
select assert(
  (select count(*) from audit_trail where tenant_id = (select tenant_id from t where label='B')) = 0,
  'the open gate to A does not expose tenant B');
reset role;
select set_config('request.jwt.claims', null, true);

-- ============ DATA-LEVEL ISOLATION SWEEP ============
-- Beyond the RLS-enabled flag: as a tenant-A user, EVERY tenant-scoped table
-- must show zero rows belonging to any other tenant — no app filter involved.
create temp table scoped_tables on commit drop as
  select table_name from app.tenant_scoped_tables();
do $$
declare tbl text; n bigint; bad text := '';
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', 'eeeeeeee-0000-0000-0000-000000000003',
    'app_metadata', json_build_object('tenant_id', (select tenant_id from t where label='A')))::text, true);
  execute 'set local role authenticated';
  for tbl in select table_name from scoped_tables loop
    execute format('select count(*) from public.%I where tenant_id is distinct from $1', tbl)
      into n using (select tenant_id from t where label='A');
    if n > 0 then bad := bad || tbl || ' '; end if;
  end loop;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
  if bad <> '' then
    raise exception 'ISOLATION SWEEP FAILED — cross-tenant rows visible in: %', bad;
  end if;
end $$;

-- ============ CHOKEPOINT SWEEP ============
-- No tenant-scoped table carries a write RLS policy for org-facing roles:
-- with FORCE RLS in front of them, every INSERT/UPDATE/DELETE must go through
-- the audited security-definer RPCs (the single transition engine).
select assert(
  not exists (
    select 1 from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relname in (select table_name from scoped_tables)
      and p.polcmd <> 'r'
      and (p.polroles = '{0}'::oid[]
           or exists (select 1 from pg_roles r where r.oid = any(p.polroles)
                      and r.rolname in ('anon','authenticated')))),
  'no write RLS policy exists for org roles on any tenant-scoped table (single engine)');
