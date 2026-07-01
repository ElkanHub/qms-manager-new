-- ============================================================================
-- Phase 5 — Platform governance & the break-glass access gate
-- The platform plane, strictly sealed from the org plane. Owner-scoped invited
-- platform admins; tenant provisioning that seeds the org via the initial QA; and
-- the gated, logged, per-tenant-configurable (default org-approved) break-glass
-- access to tenant data. Also lays the module switchboard substrate (Phase 6 seam).
-- ============================================================================

-- ---- Platform-plane membership & granular scope ----
create table if not exists public.platform_members (
  user_id    uuid primary key references public.users(id),
  is_owner   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_scopes (
  user_id    uuid not null references public.users(id),
  scope      text not null check (scope in ('provision_tenants','switchboard','access_gate')),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  primary key (user_id, scope)
);

-- Only one platform owner (the platform-plane root).
create unique index if not exists platform_one_owner on public.platform_members (is_owner) where is_owner;

-- ---- Per-tenant break-glass gate configuration (default org-approved / consent) ----
create table if not exists public.tenant_gate_config (
  tenant_id  uuid primary key references public.tenants(id),
  mode       text not null default 'org_approved' check (mode in ('org_approved','self_authorized')),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- ---- Break-glass access requests / sessions ----
create table if not exists public.access_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  requested_by uuid not null references public.users(id),
  purpose      text not null,
  mode         text not null check (mode in ('org_approved','self_authorized')),
  status       text not null default 'pending'
               check (status in ('pending','open','denied','closed','expired')),
  requested_at timestamptz not null default now(),
  decided_by   uuid,
  decided_at   timestamptz,
  decision_reason text,
  opened_at    timestamptz,
  expires_at   timestamptz,
  closed_at    timestamptz
);
create index if not exists access_requests_tenant_idx on public.access_requests (tenant_id, status);

-- ---- Module switchboard substrate (registry + per-tenant state; seam in Phase 6) ----
create table if not exists public.modules (
  key         text primary key,
  label       text not null,
  description text
);

create table if not exists public.tenant_modules (
  tenant_id  uuid not null references public.tenants(id),
  module_key text not null references public.modules(key),
  enabled    boolean not null default false,
  config     jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, module_key)
);

-- =====================  authority / gate helpers (internal)  =================
create or replace function app.is_platform_owner(p_user uuid) returns boolean
language sql stable security definer set search_path = app, public
as $$ select exists(select 1 from public.platform_members where user_id = p_user and is_owner); $$;

create or replace function app.has_platform_scope(p_user uuid, p_scope text) returns boolean
language sql stable security definer set search_path = app, public
as $$
  select app.is_platform_owner(p_user)
      or exists(select 1 from public.platform_scopes where user_id = p_user and scope = p_scope);
$$;

create or replace function app.gate_mode(p_tenant uuid) returns text
language sql stable security definer set search_path = app, public
as $$ select coalesce((select mode from public.tenant_gate_config where tenant_id = p_tenant), 'org_approved'); $$;

create or replace function app.has_open_gate(p_tenant uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = app, public
as $$
  select exists(
    select 1 from public.access_requests
    where tenant_id = p_tenant and requested_by = p_user
      and status = 'open' and (expires_at is null or expires_at > now())
  );
$$;

-- =====================  RLS  =================================================
alter table public.platform_members   enable row level security;
alter table public.platform_scopes    enable row level security;
alter table public.tenant_gate_config enable row level security;
alter table public.access_requests    enable row level security;
alter table public.modules            enable row level security;
alter table public.tenant_modules     enable row level security;
alter table public.tenant_modules     force row level security;

-- Platform membership/scope: a platform user sees their own; the owner sees all.
drop policy if exists platform_members_read on public.platform_members;
create policy platform_members_read on public.platform_members for select to authenticated
  using (user_id = auth.uid() or app.is_platform_owner(auth.uid()));
drop policy if exists platform_scopes_read on public.platform_scopes;
create policy platform_scopes_read on public.platform_scopes for select to authenticated
  using (user_id = auth.uid() or app.is_platform_owner(auth.uid()));

-- Gate config: the tenant's org users see their own; platform users may read (to know the mode).
drop policy if exists gate_config_read on public.tenant_gate_config;
create policy gate_config_read on public.tenant_gate_config for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform());

-- Access requests: the tenant's org sees requests against it; the requester sees their own.
drop policy if exists access_requests_read on public.access_requests;
create policy access_requests_read on public.access_requests for select to authenticated
  using (tenant_id = public.current_tenant_id() or requested_by = auth.uid());

-- Modules registry is reference data; tenant_modules read-only to the tenant + platform.
drop policy if exists modules_read on public.modules;
create policy modules_read on public.modules for select to authenticated using (true);
drop policy if exists tenant_modules_read on public.tenant_modules;
create policy tenant_modules_read on public.tenant_modules for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform());

grant select on public.platform_members, public.platform_scopes, public.tenant_gate_config,
  public.access_requests, public.modules, public.tenant_modules to authenticated;

-- =====================  platform RPCs  ======================================

-- Bootstrap the single platform owner (the only account not created by invite).
-- Called once by a server action when the PLATFORM_OWNER_EMAIL identity first signs in.
create or replace function public.bootstrap_platform_owner(p_user_id uuid, p_email text)
returns void
language plpgsql security definer set search_path = app, public, extensions
as $$
begin
  if exists (select 1 from public.platform_members where is_owner) then
    raise exception 'bootstrap_platform_owner: an owner already exists';
  end if;
  insert into public.users(id, email, plane, initial_role)
    values (p_user_id, lower(p_email), 'platform', 'owner')
    on conflict (id) do update set plane = 'platform';
  insert into public.platform_members(user_id, is_owner) values (p_user_id, true);
  update auth.users set raw_app_meta_data =
    coalesce(raw_app_meta_data,'{}'::jsonb) || jsonb_build_object('plane','platform','platform_role','owner')
    where id = p_user_id;
  perform app.write_audit('platform.owner_bootstrapped', p_user_id, lower(p_email),
    null, null, null, 'platform_member', p_user_id::text, null,
    jsonb_build_object('email', lower(p_email)), null, 'bootstrap');
end;
$$;

-- Owner invites additional platform admins, each individually scoped.
create or replace function public.platform_invite_admin(p_email text, p_scopes text[])
returns table(invitation_id uuid, token text)
language plpgsql security definer set search_path = app, public
as $$
declare v_caller uuid := auth.uid(); v_inv record;
begin
  if not app.is_platform_owner(v_caller) then raise exception 'platform_invite_admin: owner only'; end if;
  select * into v_inv from app.create_invitation(
    p_email, 'platform', 'admin', null, null, null,
    jsonb_build_object('scopes', to_jsonb(p_scopes)), v_caller, null, interval '7 days', 'S-PLATFORM-ADMINS');
  invitation_id := v_inv.id; token := v_inv.token; return next;
end;
$$;

-- Grant/revoke a platform admin's scope (owner only, granular least-privilege).
create or replace function public.platform_grant_scope(p_user uuid, p_scope text)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid();
begin
  if not app.is_platform_owner(v_caller) then raise exception 'platform_grant_scope: owner only'; end if;
  insert into public.platform_scopes(user_id, scope, granted_by) values (p_user, p_scope, v_caller)
    on conflict do nothing;
  perform app.write_audit('platform.scope_granted', v_caller, null, null, null, null,
    'platform_scope', p_user::text, null, jsonb_build_object('scope', p_scope), null, 'S-PLATFORM-ADMINS');
end; $$;

create or replace function public.platform_revoke_scope(p_user uuid, p_scope text)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid();
begin
  if not app.is_platform_owner(v_caller) then raise exception 'platform_revoke_scope: owner only'; end if;
  delete from public.platform_scopes where user_id = p_user and scope = p_scope;
  perform app.write_audit('platform.scope_revoked', v_caller, null, null, null, null,
    'platform_scope', p_user::text, jsonb_build_object('scope', p_scope), null, null, 'S-PLATFORM-ADMINS');
end; $$;

-- Provision a tenant and invite its initial QA (seeds the org plane). Scoped.
create or replace function public.platform_provision_tenant(
  p_tenant_name text, p_org_name text, p_qa_email text)
returns table(tenant_id uuid, org_id uuid, qa_department_id uuid, qa_invite_token text)
language plpgsql security definer set search_path = app, public
as $$
declare v_caller uuid := auth.uid(); v_prov record; v_inv record;
begin
  if not app.has_platform_scope(v_caller, 'provision_tenants') then
    raise exception 'platform_provision_tenant: requires provision_tenants scope';
  end if;
  select * into v_prov from app.provision_tenant(p_tenant_name, p_org_name, v_caller, null, 'S-TENANT-PROVISION');
  -- default gate mode = org-approved (consent) for the new tenant
  insert into public.tenant_gate_config(tenant_id, mode, updated_by)
    values (v_prov.tenant_id, 'org_approved', v_caller);
  -- invite the initial QA (the only org user from outside)
  select * into v_inv from app.create_invitation(
    p_qa_email, 'org', 'qa', v_prov.tenant_id, v_prov.org_id, v_prov.qa_department_id,
    '{}'::jsonb, v_caller, null, interval '14 days', 'S-TENANT-PROVISION');
  tenant_id := v_prov.tenant_id; org_id := v_prov.org_id;
  qa_department_id := v_prov.qa_department_id; qa_invite_token := v_inv.token;
  return next;
end;
$$;

-- Set a tenant's gate mode. The trust posture is the tenant's to choose, so the
-- tenant's QA may set it; the platform owner may also set it (e.g. on provisioning).
create or replace function public.set_gate_mode(p_tenant uuid, p_mode text)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_old text;
begin
  if not (app.is_platform_owner(v_caller)
          or (app.is_qa(v_caller) and (select tenant_id from app.actor_context(v_caller)) = p_tenant)) then
    raise exception 'set_gate_mode: only the platform owner or the tenant''s QA may set the gate mode';
  end if;
  v_old := app.gate_mode(p_tenant);
  insert into public.tenant_gate_config(tenant_id, mode, updated_by, updated_at)
    values (p_tenant, p_mode, v_caller, now())
    on conflict (tenant_id) do update set mode = excluded.mode, updated_by = v_caller, updated_at = now();
  perform app.write_audit('gate.mode_set', v_caller, null, p_tenant, null, null,
    'tenant_gate_config', p_tenant::text, jsonb_build_object('mode', v_old),
    jsonb_build_object('mode', p_mode), null, 'S-GATE-CONFIG');
end; $$;

-- =====================  the break-glass gate  ===============================

-- A platform admin requests access to a tenant's data for a bounded purpose.
-- self_authorized → opens immediately (notification). org_approved → waits for QA.
create or replace function public.request_tenant_access(p_tenant uuid, p_purpose text)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_mode text; v_id uuid; v_status text; v_open timestamptz; v_exp timestamptz;
begin
  if not app.has_platform_scope(v_caller, 'access_gate') then
    raise exception 'request_tenant_access: requires access_gate scope';
  end if;
  if p_purpose is null or length(trim(p_purpose)) = 0 then
    raise exception 'request_tenant_access: a purpose is required';
  end if;
  v_mode := app.gate_mode(p_tenant);
  if v_mode = 'self_authorized' then
    v_status := 'open'; v_open := now(); v_exp := now() + interval '2 hours';
  else
    v_status := 'pending';
  end if;
  insert into public.access_requests(tenant_id, requested_by, purpose, mode, status, opened_at, expires_at)
    values (p_tenant, v_caller, p_purpose, v_mode, v_status, v_open, v_exp) returning id into v_id;

  -- Audited on the TENANT chain (so the org sees it) and the platform chain.
  perform app.write_audit(
    case when v_status='open' then 'gate.opened_self' else 'gate.requested' end,
    v_caller, null, p_tenant, null, null, 'access_request', v_id::text, null,
    jsonb_build_object('purpose', p_purpose, 'mode', v_mode), p_purpose, 'S-ACCESS-GATE', null, null,
    '{}'::jsonb, true);
  perform app.write_audit('platform.access_requested', v_caller, null, null, null, null,
    'access_request', v_id::text, null, jsonb_build_object('tenant', p_tenant, 'mode', v_mode), null, 'S-ACCESS-GATE');
  return v_id;
end; $$;

-- The tenant's QA approves/denies a pending request (consent mode). QA-of-tenant only.
create or replace function public.decide_access_request(p_request uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); r public.access_requests;
begin
  select * into r from public.access_requests where id = p_request for update;
  if r.id is null then raise exception 'decide_access_request: no such request'; end if;
  if not (app.is_qa(v_caller) and (select tenant_id from app.actor_context(v_caller)) = r.tenant_id) then
    raise exception 'decide_access_request: only the tenant''s QA may decide';
  end if;
  if r.status <> 'pending' then raise exception 'decide_access_request: request is %', r.status; end if;

  if p_approve then
    update public.access_requests set status='open', decided_by=v_caller, decided_at=now(),
      decision_reason=p_reason, opened_at=now(), expires_at=now()+interval '2 hours' where id=p_request;
    perform app.write_audit('gate.granted', v_caller, null, r.tenant_id, null, null,
      'access_request', p_request::text, jsonb_build_object('status','pending'),
      jsonb_build_object('status','open'), p_reason, 'S-ACCESS-GRANT', null, null, '{}'::jsonb, true);
  else
    update public.access_requests set status='denied', decided_by=v_caller, decided_at=now(),
      decision_reason=p_reason where id=p_request;
    perform app.write_audit('gate.denied', v_caller, null, r.tenant_id, null, null,
      'access_request', p_request::text, jsonb_build_object('status','pending'),
      jsonb_build_object('status','denied'), p_reason, 'S-ACCESS-GRANT', null, null, '{}'::jsonb, true);
  end if;
end; $$;

-- Close an open session (by the requester or the tenant's QA).
create or replace function public.close_access_request(p_request uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); r public.access_requests;
begin
  select * into r from public.access_requests where id = p_request for update;
  if r.id is null then raise exception 'close_access_request: no such request'; end if;
  if not (r.requested_by = v_caller
          or (app.is_qa(v_caller) and (select tenant_id from app.actor_context(v_caller)) = r.tenant_id)) then
    raise exception 'close_access_request: not permitted';
  end if;
  update public.access_requests set status='closed', closed_at=now() where id=p_request and status='open';
  perform app.write_audit('gate.closed', v_caller, null, r.tenant_id, null, null,
    'access_request', p_request::text, jsonb_build_object('status','open'),
    jsonb_build_object('status','closed'), null, 'S-ACCESS-GATE');
end; $$;

-- Every explicit view a platform admin makes during an open session is logged on
-- the tenant chain (so the org sees exactly what was viewed). Refuses if no open gate.
create or replace function public.log_platform_view(p_tenant uuid, p_what text)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid();
begin
  if not app.has_open_gate(p_tenant, v_caller) then
    raise exception 'log_platform_view: no open access session for this tenant';
  end if;
  perform app.write_audit('platform.viewed', v_caller, null, p_tenant, null, null,
    'tenant', p_tenant::text, null, jsonb_build_object('what', p_what), null, 'S-ACCESS-GATE');
end; $$;

-- =====================  switchboard toggle (mechanics; policy in Phase 6)  ===
create or replace function public.set_module(
  p_tenant uuid, p_module text, p_enabled boolean, p_config jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_old record;
begin
  if not app.has_platform_scope(v_caller, 'switchboard') then
    raise exception 'set_module: requires switchboard scope';
  end if;
  select enabled, config into v_old from public.tenant_modules where tenant_id=p_tenant and module_key=p_module;
  insert into public.tenant_modules(tenant_id, module_key, enabled, config, updated_by, updated_at)
    values (p_tenant, p_module, p_enabled, coalesce(p_config,'{}'::jsonb), v_caller, now())
    on conflict (tenant_id, module_key)
    do update set enabled=excluded.enabled, config=excluded.config, updated_by=v_caller, updated_at=now();
  perform app.write_audit('switchboard.module_set', v_caller, null, p_tenant, null, null,
    'tenant_module', p_module, to_jsonb(v_old), jsonb_build_object('enabled',p_enabled,'config',p_config),
    null, 'S-SWITCHBOARD');
end; $$;

-- ---------------------------------------------------------------------------
-- Extend accept_invitation once more: a platform-plane invite must also create
-- the platform_members row and the granted scopes (from the invite's scope.scopes),
-- so an invited admin actually has authority. Org-plane behaviour is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(
  p_token     text,
  p_user_id   uuid,
  p_email     text,
  p_full_name text default null,
  p_source    text default null
) returns public.users
language plpgsql security definer set search_path = app, public, extensions
as $$
declare
  inv public.invitations;
  u   public.users;
  v_meta jsonb;
  v_dept_scoped boolean;
  v_scope text;
begin
  select * into inv from public.invitations where token = p_token for update;
  if inv.id is null then raise exception 'accept_invitation: invalid invitation'; end if;
  if inv.status <> 'pending' then raise exception 'accept_invitation: invitation already %', inv.status; end if;
  if inv.expires_at < now() then
    update public.invitations set status = 'expired' where id = inv.id;
    raise exception 'accept_invitation: invitation has expired';
  end if;
  if lower(inv.email) <> lower(p_email) then
    raise exception 'accept_invitation: email does not match the invitation';
  end if;

  insert into public.users(id, tenant_id, org_id, department_id, email, full_name, plane, initial_role)
  values (p_user_id, inv.tenant_id, inv.org_id, inv.department_id, lower(p_email),
          p_full_name, inv.plane, inv.initial_role)
  returning * into u;

  v_meta := coalesce((select raw_app_meta_data from auth.users where id = p_user_id), '{}'::jsonb);
  if inv.plane = 'platform' then
    v_meta := v_meta || jsonb_build_object('plane', 'platform', 'platform_role', inv.initial_role);
    -- Platform membership (invited admins are never owner) + granted scopes.
    insert into public.platform_members(user_id, is_owner) values (p_user_id, false)
      on conflict do nothing;
    for v_scope in select jsonb_array_elements_text(coalesce(inv.scope->'scopes', '[]'::jsonb)) loop
      insert into public.platform_scopes(user_id, scope, granted_by)
        values (p_user_id, v_scope, inv.invited_by) on conflict do nothing;
    end loop;
  else
    v_meta := v_meta || jsonb_build_object('plane', 'org', 'tenant_id', inv.tenant_id::text);
    select department_scoped into v_dept_scoped from public.roles where key = inv.initial_role;
    if v_dept_scoped is not null then
      insert into public.user_roles(user_id, tenant_id, role, department_id, granted_by)
      values (p_user_id, inv.tenant_id, inv.initial_role,
              case when v_dept_scoped then inv.department_id else null end, inv.invited_by)
      on conflict do nothing;
    end if;
  end if;
  update auth.users set raw_app_meta_data = v_meta where id = p_user_id;
  update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;

  perform app.write_audit('invitation.accepted', p_user_id, lower(p_email),
    inv.tenant_id, inv.org_id, inv.department_id, 'invitation', inv.id::text, null, null, null, p_source);
  perform app.write_audit('user.created', p_user_id, lower(p_email),
    inv.tenant_id, inv.org_id, inv.department_id, 'user', p_user_id::text, null,
    jsonb_build_object('email', lower(p_email), 'role', inv.initial_role, 'plane', inv.plane),
    null, p_source);
  return u;
end;
$$;
revoke all on function public.accept_invitation(text, uuid, text, text, text) from public;
grant execute on function public.accept_invitation(text, uuid, text, text, text) to service_role;

-- ---- grants ----
revoke all on function public.bootstrap_platform_owner(uuid, text) from public;
grant execute on function public.bootstrap_platform_owner(uuid, text) to service_role;
revoke all on function public.platform_invite_admin(text, text[]) from public;
revoke all on function public.platform_grant_scope(uuid, text) from public;
revoke all on function public.platform_revoke_scope(uuid, text) from public;
revoke all on function public.platform_provision_tenant(text, text, text) from public;
revoke all on function public.set_gate_mode(uuid, text) from public;
revoke all on function public.request_tenant_access(uuid, text) from public;
revoke all on function public.decide_access_request(uuid, boolean, text) from public;
revoke all on function public.close_access_request(uuid) from public;
revoke all on function public.log_platform_view(uuid, text) from public;
revoke all on function public.set_module(uuid, text, boolean, jsonb) from public;
grant execute on function public.platform_invite_admin(text, text[]),
  public.platform_grant_scope(uuid, text), public.platform_revoke_scope(uuid, text),
  public.platform_provision_tenant(text, text, text), public.set_gate_mode(uuid, text),
  public.request_tenant_access(uuid, text), public.decide_access_request(uuid, boolean, text),
  public.close_access_request(uuid), public.log_platform_view(uuid, text),
  public.set_module(uuid, text, boolean, jsonb)
  to authenticated, service_role;
