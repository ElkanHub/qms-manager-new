-- ============================================================================
-- Phase 3 — Identity, invitation & auth
-- Invite-only identity. Accounts are born bound to tenant/org/department/role.
-- Google SSO + mandatory MFA are provider-level (Supabase Auth); this migration
-- owns the app-side identity model, the invitation lifecycle, and deactivation.
-- No account exists without a consumed invitation (rule 0.5).
-- ============================================================================

-- App-side user record. id === auth.users.id (Google identity). Never hard-deleted.
create table if not exists public.users (
  id            uuid primary key references auth.users(id),
  tenant_id     uuid references public.tenants(id),        -- null only for platform-plane users
  org_id        uuid references public.organizations(id),
  department_id uuid references public.departments(id),
  email         text not null,
  full_name     text,
  plane         text not null default 'org' check (plane in ('org', 'platform')),
  initial_role  text,                                      -- role at birth; Phase 4 owns assignments
  status        text not null default 'active' check (status in ('active', 'deactivated')),
  created_at    timestamptz not null default now(),
  deactivated_at timestamptz
);

-- One-time, expiring invitations — the ONLY way an account comes into being.
create table if not exists public.invitations (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique,                      -- the secret in the invite link
  email         text not null,
  plane         text not null default 'org' check (plane in ('org', 'platform')),
  tenant_id     uuid references public.tenants(id),
  org_id        uuid references public.organizations(id),
  department_id uuid references public.departments(id),
  initial_role  text not null,
  scope         jsonb not null default '{}'::jsonb,
  invited_by    uuid,
  status        text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at    timestamptz not null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists invitations_email_idx on public.invitations (lower(email));
create index if not exists invitations_tenant_idx on public.invitations (tenant_id);

-- Trusted-device remembering so mandatory MFA isn't re-challenged every login
-- (FOUNDATIONS §6.3). The device holds an opaque token; we store only its hash.
create table if not exists public.trusted_devices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id),
  device_hash    text not null,
  last_verified_at timestamptz not null default now(),
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now(),
  unique (user_id, device_hash)
);

-- ---- immutability: freeze tenant_id on users too ----
drop trigger if exists freeze_tenant_id on public.users;
create trigger freeze_tenant_id before update on public.users
  for each row execute function app.freeze_tenant_id();

-- ---------------------------------------------------------------------------
-- RLS — org-scoped visibility; writes only through the definer RPCs below.
-- ---------------------------------------------------------------------------
alter table public.users           enable row level security;
alter table public.invitations     enable row level security;
alter table public.trusted_devices enable row level security;
alter table public.users           force row level security;
alter table public.invitations     force row level security;
alter table public.trusted_devices force row level security;

-- A user can always see their own row (platform users have no tenant, so the
-- tenant-match policy alone would hide them from themselves).
drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select to authenticated using (id = auth.uid());

drop policy if exists users_self_tenant_select on public.users;
create policy users_self_tenant_select on public.users
  for select to authenticated using (tenant_id = public.current_tenant_id());

drop policy if exists invitations_tenant_select on public.invitations;
create policy invitations_tenant_select on public.invitations
  for select to authenticated using (tenant_id = public.current_tenant_id());

drop policy if exists trusted_devices_self_select on public.trusted_devices;
create policy trusted_devices_self_select on public.trusted_devices
  for select to authenticated using (user_id = auth.uid());

grant select on public.users, public.invitations, public.trusted_devices to authenticated;

-- ---------------------------------------------------------------------------
-- create_invitation — records an invite + token. SECURITY DEFINER; granted to
-- service_role only. Authority checks (who may invite whom) are layered by the
-- Phase 4 (org) and Phase 5 (platform) wrappers that call this.
-- ---------------------------------------------------------------------------
create or replace function app.create_invitation(
  p_email       text,
  p_plane       text,
  p_initial_role text,
  p_tenant_id   uuid default null,
  p_org_id      uuid default null,
  p_department_id uuid default null,
  p_scope       jsonb default '{}'::jsonb,
  p_invited_by  uuid default null,
  p_actor_email text default null,
  p_expires     interval default interval '7 days',
  p_source      text default null
) returns table(id uuid, token text)
language plpgsql
security definer
set search_path = app, public, extensions
as $$
declare
  v_id uuid;
  v_token text := encode(gen_random_bytes(32), 'hex');
begin
  if p_email is null or position('@' in p_email) = 0 then
    raise exception 'create_invitation: a valid email is required';
  end if;
  insert into public.invitations(token, email, plane, tenant_id, org_id, department_id,
    initial_role, scope, invited_by, expires_at)
  values (v_token, lower(p_email), p_plane, p_tenant_id, p_org_id, p_department_id,
    p_initial_role, coalesce(p_scope, '{}'::jsonb), p_invited_by, now() + p_expires)
  returning invitations.id into v_id;

  perform app.write_audit('invitation.created', p_invited_by, p_actor_email,
    p_tenant_id, p_org_id, p_department_id, 'invitation', v_id::text, null,
    jsonb_build_object('email', lower(p_email), 'plane', p_plane, 'role', p_initial_role,
                       'scope', coalesce(p_scope, '{}'::jsonb)),
    null, p_source);

  id := v_id; token := v_token; return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_invitation — the ONLY path that mints an app account. Validates the
-- one-time token, binds the account to the invite's context, stamps the signed
-- JWT app_metadata (so RLS/tenant context work), and consumes the invite.
-- In `public` so the server action can call it via PostgREST; execute is granted
-- to service_role only (never authenticated). Phase 4 CREATE-OR-REPLACEs this to
-- also grant the initial role assignment.
-- ---------------------------------------------------------------------------
create or replace function public.accept_invitation(
  p_token     text,
  p_user_id   uuid,
  p_email     text,
  p_full_name text default null,
  p_source    text default null
) returns public.users
language plpgsql
security definer
set search_path = app, public, extensions
as $$
declare
  inv public.invitations;
  u   public.users;
  v_meta jsonb;
begin
  select * into inv from public.invitations where token = p_token for update;
  if inv.id is null then
    raise exception 'accept_invitation: invalid invitation';
  end if;
  if inv.status <> 'pending' then
    raise exception 'accept_invitation: invitation already % ', inv.status;
  end if;
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

  -- Stamp the signed JWT metadata. Org users carry tenant_id; platform users carry platform_role.
  v_meta := coalesce((select raw_app_meta_data from auth.users where id = p_user_id), '{}'::jsonb);
  if inv.plane = 'platform' then
    v_meta := v_meta || jsonb_build_object('plane', 'platform', 'platform_role', inv.initial_role);
  else
    v_meta := v_meta || jsonb_build_object('plane', 'org', 'tenant_id', inv.tenant_id::text);
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

-- ---------------------------------------------------------------------------
-- deactivate_user — deactivate, never delete (rule 0.6). Bans the auth identity
-- so they cannot authenticate; keeps the row so attribution survives forever.
-- ---------------------------------------------------------------------------
create or replace function app.deactivate_user(
  p_user_id     uuid,
  p_actor_id    uuid,
  p_actor_email text,
  p_reason      text,
  p_source      text default null
) returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $$
declare u public.users;
begin
  select * into u from public.users where id = p_user_id;
  if u.id is null then raise exception 'deactivate_user: no such user'; end if;

  update public.users set status = 'deactivated', deactivated_at = now() where id = p_user_id;
  -- Native auth block: banned identity cannot sign in.
  update auth.users set banned_until = 'infinity' where id = p_user_id;

  perform app.write_audit('user.deactivated', p_actor_id, p_actor_email,
    u.tenant_id, u.org_id, u.department_id, 'user', p_user_id::text,
    jsonb_build_object('status', 'active'), jsonb_build_object('status', 'deactivated'),
    p_reason, p_source, null, null, '{}'::jsonb, true);   -- reason required
end;
$$;

-- ---------------------------------------------------------------------------
-- Trusted-device recording — called after a successful MFA challenge so the
-- device isn't re-challenged within the configured window. In `public` so the
-- client can call it via PostgREST; it derives the user from auth.uid() (never
-- trusts a client-supplied identity).
-- ---------------------------------------------------------------------------
create or replace function public.remember_device(
  p_device_hash text,
  p_days        int default 30
) returns void
language plpgsql
security definer
set search_path = app, public, extensions
as $$
begin
  insert into public.trusted_devices(user_id, device_hash, expires_at)
  values (auth.uid(), p_device_hash, now() + make_interval(days => p_days))
  on conflict (user_id, device_hash)
  do update set last_verified_at = now(), expires_at = now() + make_interval(days => p_days);
end;
$$;

-- Internal helpers (called only by definer wrappers / other definer functions).
grant execute on function app.create_invitation(text, text, text, uuid, uuid, uuid, jsonb, uuid, text, interval, text) to service_role;
grant execute on function app.deactivate_user(uuid, uuid, text, text, text) to service_role;

-- Public entry points (reachable via PostgREST). accept is server-only; remember
-- is client-callable. Revoke the default PUBLIC execute, then grant narrowly.
revoke all on function public.accept_invitation(text, uuid, text, text, text) from public;
grant execute on function public.accept_invitation(text, uuid, text, text, text) to service_role;
revoke all on function public.remember_device(text, int) from public;
grant execute on function public.remember_device(text, int) to authenticated, service_role;
