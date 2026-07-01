-- ============================================================================
-- Phase 7 — Foundation hardening & verification
-- Audit-viewing access control (org QA sees their org; platform admins only via
-- the open gate), the platform-facing chain verifier, and sweep helpers the Phase
-- 7 tests use to assert the whole substrate holds together.
-- ============================================================================

-- has_open_gate is consulted by the audit-viewing policy → authenticated needs execute.
grant execute on function app.has_open_gate(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Audit-trail viewing policies (the substrate captured everything from Phase 1;
-- *seeing* it is scoped here). RLS was default-deny until now.
--   • Org users see their own tenant's entries.
--   • Platform users see platform-chain (oversight) entries, and a tenant's
--     entries only while they hold an OPEN break-glass session for that tenant.
-- ---------------------------------------------------------------------------
drop policy if exists audit_org_read on public.audit_trail;
create policy audit_org_read on public.audit_trail for select to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists audit_platform_read on public.audit_trail;
create policy audit_platform_read on public.audit_trail for select to authenticated
  using (
    public.is_platform()
    and (tenant_id is null or app.has_open_gate(tenant_id, auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Platform-facing chain verifier (S-VERIFY). Platform-only.
-- ---------------------------------------------------------------------------
create or replace function public.verify_audit_chains()
returns table(chain text, ok boolean, broken_at bigint, entries bigint)
language plpgsql security definer set search_path = app, public as $$
begin
  if not public.is_platform() then raise exception 'verify_audit_chains: platform only'; end if;
  return query select * from app.verify_audit_chain(null);
end $$;
revoke all on function public.verify_audit_chains() from public;
grant execute on function public.verify_audit_chains() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sweep helper: every table carrying tenant_id must have RLS enabled. The Phase 7
-- isolation sweep enumerates this and asserts none is unprotected.
-- ---------------------------------------------------------------------------
create or replace function app.tenant_scoped_tables()
returns table(table_name text, rls_enabled boolean)
language sql stable set search_path = app, public as $$
  select c.relname::text, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and exists (
      select 1 from information_schema.columns col
      where col.table_schema = 'public' and col.table_name = c.relname
        and col.column_name = 'tenant_id'
    );
$$;
grant execute on function app.tenant_scoped_tables() to service_role;
