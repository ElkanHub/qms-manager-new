-- ============================================================================
-- Phase 2 — Tenancy & organization model
-- Platform → Tenant → Organization → Department, single-site (no branch), with
-- hard RLS isolation keyed on tenant. Tenant/org modelled as separate 1:1 levels.
-- Tenant context is server-derived from the signed JWT (never client-asserted).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tenant context resolution (rule 0.2). Read from the signed JWT app_metadata,
-- which is stamped at account creation by the service role (Phase 3) — the user
-- cannot forge it. Placed in public so RLS policies (run as the caller) can call it.
-- ---------------------------------------------------------------------------
create or replace function public.current_tenant_id() returns uuid
language sql stable
as $$
  select nullif(coalesce(auth.jwt() -> 'app_metadata' ->> 'tenant_id', ''), '')::uuid;
$$;

create or replace function public.is_platform() returns boolean
language sql stable
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'platform_role') is not null;
$$;

grant execute on function public.current_tenant_id() to anon, authenticated, service_role;
grant execute on function public.is_platform() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Hierarchy tables. tenant_id is on every controlled row from here on, never
-- null, never mutated (enforced by trigger below).
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  status     text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null unique references public.tenants(id),  -- unique = 1:1 with tenant today
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id),
  org_id     uuid not null references public.organizations(id),
  -- Future-proofing for single-site → multi-site: a nullable branch_id can be added
  -- here later (between org and department) without rewriting existing rows.
  name       text not null,
  is_default boolean not null default false,   -- the QA default department
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

-- Exactly one default (QA) department per org.
create unique index if not exists departments_one_default_per_org
  on public.departments (org_id) where is_default;

-- ---------------------------------------------------------------------------
-- tenant_id immutability guard — reusable across every tenant-scoped table.
-- ---------------------------------------------------------------------------
create or replace function app.freeze_tenant_id() returns trigger
language plpgsql
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id is immutable and cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists freeze_tenant_id on public.organizations;
create trigger freeze_tenant_id before update on public.organizations
  for each row execute function app.freeze_tenant_id();
drop trigger if exists freeze_tenant_id on public.departments;
create trigger freeze_tenant_id before update on public.departments
  for each row execute function app.freeze_tenant_id();

-- ---------------------------------------------------------------------------
-- RLS: default-deny, isolation keyed on tenant. Org users see only their own
-- tenant's rows. Writes go through SECURITY DEFINER RPCs (rule 0.3), so no broad
-- INSERT/UPDATE policies are granted here.
-- ---------------------------------------------------------------------------
alter table public.tenants       enable row level security;
alter table public.organizations enable row level security;
alter table public.departments   enable row level security;
alter table public.tenants       force row level security;
alter table public.organizations force row level security;
alter table public.departments   force row level security;

drop policy if exists tenants_self_select on public.tenants;
create policy tenants_self_select on public.tenants
  for select to authenticated using (id = public.current_tenant_id());

drop policy if exists orgs_self_select on public.organizations;
create policy orgs_self_select on public.organizations
  for select to authenticated using (tenant_id = public.current_tenant_id());

drop policy if exists departments_self_select on public.departments;
create policy departments_self_select on public.departments
  for select to authenticated using (tenant_id = public.current_tenant_id());

grant select on public.tenants, public.organizations, public.departments to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic, audited provisioning core: tenant + org + default QA department in one
-- transaction. Phase 5 wraps this (adding the initial-QA invite). SECURITY DEFINER,
-- owned by a superuser role, so it may write across RLS while callers cannot.
-- ---------------------------------------------------------------------------
create or replace function app.provision_tenant(
  p_tenant_name text,
  p_org_name    text,
  p_actor_id    uuid,
  p_actor_email text default null,
  p_source      text default null
) returns table(tenant_id uuid, org_id uuid, qa_department_id uuid)
language plpgsql
security definer
set search_path = app, public, extensions
as $$
declare
  v_tenant uuid;
  v_org    uuid;
  v_qa     uuid;
begin
  if p_tenant_name is null or length(trim(p_tenant_name)) = 0 then
    raise exception 'provision_tenant: tenant name is required';
  end if;

  insert into public.tenants(name) values (p_tenant_name) returning id into v_tenant;
  insert into public.organizations(tenant_id, name)
    values (v_tenant, coalesce(p_org_name, p_tenant_name)) returning id into v_org;
  -- QA is the first and default department (FOUNDATIONS §5).
  insert into public.departments(tenant_id, org_id, name, is_default)
    values (v_tenant, v_org, 'QA', true) returning id into v_qa;

  -- Audit: on the new tenant's chain (org visibility) …
  perform app.write_audit('tenant.provisioned', p_actor_id, p_actor_email, v_tenant, v_org, null,
    'tenant', v_tenant::text, null,
    jsonb_build_object('name', p_tenant_name), null, p_source);
  perform app.write_audit('organization.created', p_actor_id, p_actor_email, v_tenant, v_org, null,
    'organization', v_org::text, null, jsonb_build_object('name', coalesce(p_org_name, p_tenant_name)),
    null, p_source);
  perform app.write_audit('department.created', p_actor_id, p_actor_email, v_tenant, v_org, v_qa,
    'department', v_qa::text, null, jsonb_build_object('name', 'QA', 'is_default', true),
    null, p_source);
  -- … and on the platform chain (cross-tenant oversight: who provisioned what).
  perform app.write_audit('platform.tenant_provisioned', p_actor_id, p_actor_email, null, null, null,
    'tenant', v_tenant::text, null, jsonb_build_object('name', p_tenant_name), null, p_source);

  tenant_id := v_tenant; org_id := v_org; qa_department_id := v_qa;
  return next;
end;
$$;

comment on function app.provision_tenant is
  'Atomic, audited tenant+org+default-QA-department creation. Wrapped by Phase 5 provisioning.';

grant execute on function app.provision_tenant(text, text, uuid, text, text) to service_role;
