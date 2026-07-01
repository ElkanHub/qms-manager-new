-- ============================================================================
-- Phase 4 — Organization governance & roles (QA as root)
-- The org-plane role system. QA is the root authority that provisions everything
-- else. Roles are distinct and scoped. Quality-critical grants (QA/Approver/
-- Signatory) stay with QA even when user-provisioning is delegated to Org-Admin.
-- Ships the reusable segregation-of-duties primitive the document-control core
-- will consume later.
-- ============================================================================

-- Role catalogue (reference data). quality_critical roles may only be GRANTED by
-- QA; department_scoped roles resolve to a specific department (else org-wide).
create table if not exists public.roles (
  key               text primary key,
  label             text not null,
  quality_critical  boolean not null default false,
  department_scoped boolean not null default false
);

insert into public.roles (key, label, quality_critical, department_scoped) values
  ('author',    'Author',    false, true),
  ('hod',       'HOD',       false, true),
  ('qa',        'QA',        true,  false),
  ('approver',  'Approver',  true,  false),
  ('signatory', 'Signatory', true,  false),
  ('trainer',   'Trainer',   false, true),
  ('org_admin', 'Org-Admin', false, false),
  ('viewer',    'Viewer',    false, true)
on conflict (key) do nothing;

-- Role assignments. department_id is null for org-wide roles (QA/Approver/…),
-- set for department-scoped roles (a HOD *of a department*).
create table if not exists public.user_roles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id),
  tenant_id     uuid not null references public.tenants(id),
  role          text not null references public.roles(key),
  department_id uuid references public.departments(id),
  granted_by    uuid,
  granted_at    timestamptz not null default now(),
  unique (user_id, role, department_id)
);
create index if not exists user_roles_user_idx on public.user_roles (user_id);

drop trigger if exists freeze_tenant_id on public.user_roles;
create trigger freeze_tenant_id before update on public.user_roles
  for each row execute function app.freeze_tenant_id();

-- ---- RLS: reference roles world-readable to org users; assignments tenant-scoped ----
alter table public.roles      enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_roles force row level security;

drop policy if exists roles_read on public.roles;
create policy roles_read on public.roles for select to authenticated using (true);

drop policy if exists user_roles_tenant_select on public.user_roles;
create policy user_roles_tenant_select on public.user_roles
  for select to authenticated using (tenant_id = public.current_tenant_id());

grant select on public.roles, public.user_roles to authenticated;

-- ---------------------------------------------------------------------------
-- Authority helpers (internal). Roles are read live from user_roles, so a grant
-- or revoke takes effect immediately (no JWT re-issue needed).
-- ---------------------------------------------------------------------------
create or replace function app.actor_context(p_user uuid)
returns table(tenant_id uuid, org_id uuid, department_id uuid)
language sql stable security definer set search_path = app, public
as $$ select u.tenant_id, u.org_id, u.department_id from public.users u where u.id = p_user; $$;

create or replace function app.has_role(p_user uuid, p_role text, p_department uuid default null)
returns boolean
language sql stable security definer set search_path = app, public
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.key = ur.role
    where ur.user_id = p_user and ur.role = p_role
      and (not r.department_scoped or p_department is null or ur.department_id = p_department)
  );
$$;

create or replace function app.is_qa(p_user uuid) returns boolean
language sql stable security definer set search_path = app, public
as $$ select app.has_role(p_user, 'qa'); $$;

-- Org-Admin OR QA — the "may provision users" authority (QA delegable).
create or replace function app.can_provision_users(p_user uuid) returns boolean
language sql stable security definer set search_path = app, public
as $$ select app.is_qa(p_user) or app.has_role(p_user, 'org_admin'); $$;

-- ---------------------------------------------------------------------------
-- Segregation-of-duties primitive (rule: action-level, actor vs record owner).
-- The document-control core will consume this; built here as a shared guard, not
-- inside any one workflow. sod_ok returns the check; enforce_sod raises on violation.
-- ---------------------------------------------------------------------------
create or replace function app.sod_ok(p_actor uuid, p_record_owner uuid) returns boolean
language sql immutable
as $$ select p_actor is distinct from p_record_owner; $$;

create or replace function app.enforce_sod(p_actor uuid, p_record_owner uuid, p_action text)
returns void
language plpgsql immutable
as $$
begin
  if not app.sod_ok(p_actor, p_record_owner) then
    raise exception 'segregation of duties: the same person cannot perform "%" on a record they authored/requested', p_action;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- grant_role — QA-root role granting with the quality-critical boundary enforced
-- server-side (rule 0.3). Caller is the current session user.
-- ---------------------------------------------------------------------------
create or replace function public.grant_role(
  p_target_user uuid,
  p_role        text,
  p_department  uuid default null
) returns void
language plpgsql security definer set search_path = app, public
as $$
declare
  v_caller uuid := auth.uid();
  v_ctx    record;
  v_tctx   record;
  v_critical boolean;
begin
  select * into v_ctx from app.actor_context(v_caller);
  select * into v_tctx from app.actor_context(p_target_user);
  if v_ctx.tenant_id is null then raise exception 'grant_role: caller is not an org user'; end if;
  if v_tctx.tenant_id is distinct from v_ctx.tenant_id then
    raise exception 'grant_role: target is in a different tenant';
  end if;

  select quality_critical into v_critical from public.roles where key = p_role;
  if v_critical is null then raise exception 'grant_role: unknown role %', p_role; end if;

  -- The delegation boundary: quality-critical roles are QA-only; others QA or Org-Admin.
  if v_critical then
    if not app.is_qa(v_caller) then
      raise exception 'grant_role: only QA may grant the quality-critical role %', p_role;
    end if;
  else
    if not app.can_provision_users(v_caller) then
      raise exception 'grant_role: only QA or Org-Admin may grant roles';
    end if;
  end if;

  insert into public.user_roles(user_id, tenant_id, role, department_id, granted_by)
  values (p_target_user, v_tctx.tenant_id, p_role, p_department, v_caller)
  on conflict (user_id, role, department_id) do nothing;

  perform app.write_audit('role.granted', v_caller, null,
    v_tctx.tenant_id, v_tctx.org_id, p_department, 'user_role', p_target_user::text,
    null, jsonb_build_object('role', p_role, 'department_id', p_department), null, 'S-USERS');
end;
$$;

create or replace function public.revoke_role(
  p_target_user uuid,
  p_role        text,
  p_department  uuid default null
) returns void
language plpgsql security definer set search_path = app, public
as $$
declare
  v_caller uuid := auth.uid();
  v_critical boolean;
  v_tctx   record;
begin
  select * into v_tctx from app.actor_context(p_target_user);
  select quality_critical into v_critical from public.roles where key = p_role;
  if v_critical then
    if not app.is_qa(v_caller) then raise exception 'revoke_role: quality-critical roles are QA-only'; end if;
  else
    if not app.can_provision_users(v_caller) then raise exception 'revoke_role: QA or Org-Admin only'; end if;
  end if;

  delete from public.user_roles
   where user_id = p_target_user and role = p_role and department_id is not distinct from p_department;

  perform app.write_audit('role.revoked', v_caller, null,
    v_tctx.tenant_id, v_tctx.org_id, p_department, 'user_role', p_target_user::text,
    jsonb_build_object('role', p_role, 'department_id', p_department), null, null, 'S-USERS');
end;
$$;

-- ---------------------------------------------------------------------------
-- create_department — QA creates departments within their org. Audited.
-- ---------------------------------------------------------------------------
create or replace function public.create_department(p_name text)
returns uuid
language plpgsql security definer set search_path = app, public
as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_id uuid;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if not app.is_qa(v_caller) then raise exception 'create_department: QA only'; end if;
  insert into public.departments(tenant_id, org_id, name)
    values (v_ctx.tenant_id, v_ctx.org_id, p_name) returning id into v_id;
  perform app.write_audit('department.created', v_caller, null,
    v_ctx.tenant_id, v_ctx.org_id, v_id, 'department', v_id::text, null,
    jsonb_build_object('name', p_name), null, 'S-DEPARTMENTS');
  return v_id;
end;
$$;

-- assign_hod — QA assigns a HOD to a department (a department-scoped role grant).
create or replace function public.assign_hod(p_target_user uuid, p_department uuid)
returns void
language plpgsql security definer set search_path = app, public
as $$
declare v_caller uuid := auth.uid();
begin
  if not app.is_qa(v_caller) then raise exception 'assign_hod: QA only'; end if;
  perform public.grant_role(p_target_user, 'hod', p_department);
  perform app.write_audit('hod.assigned', v_caller, null,
    (select tenant_id from app.actor_context(p_target_user)),
    (select org_id from app.actor_context(p_target_user)), p_department,
    'department', p_department::text, null,
    jsonb_build_object('user_id', p_target_user), null, 'S-DEPARTMENTS');
end;
$$;

-- ---------------------------------------------------------------------------
-- org_invite_user — QA/Org-Admin invite org users. Quality-critical intended
-- roles require the caller to be QA (delegation boundary applies at invite time
-- too). Returns the invite token so the app can build the link.
-- ---------------------------------------------------------------------------
create or replace function public.org_invite_user(
  p_email       text,
  p_role        text,
  p_department  uuid default null,
  p_scope       jsonb default '{}'::jsonb
) returns table(invitation_id uuid, token text)
language plpgsql security definer set search_path = app, public
as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_critical boolean; v_inv record;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'org_invite_user: caller is not an org user'; end if;

  select quality_critical into v_critical from public.roles where key = p_role;
  if v_critical is null then raise exception 'org_invite_user: unknown role %', p_role; end if;
  if v_critical then
    if not app.is_qa(v_caller) then raise exception 'org_invite_user: quality-critical roles are QA-only'; end if;
  else
    if not app.can_provision_users(v_caller) then raise exception 'org_invite_user: QA or Org-Admin only'; end if;
  end if;

  select * into v_inv from app.create_invitation(
    p_email, 'org', p_role, v_ctx.tenant_id, v_ctx.org_id, p_department, p_scope, v_caller, null,
    interval '7 days', 'S-INVITE');
  invitation_id := v_inv.id; token := v_inv.token; return next;
end;
$$;

-- org_deactivate_user — QA/Org-Admin deactivate an org user (delegable IT work).
create or replace function public.org_deactivate_user(p_target_user uuid, p_reason text)
returns void
language plpgsql security definer set search_path = app, public
as $$
declare v_caller uuid := auth.uid();
begin
  if not app.can_provision_users(v_caller) then raise exception 'org_deactivate_user: QA or Org-Admin only'; end if;
  perform app.deactivate_user(p_target_user, v_caller, null, p_reason, 'S-USERS');
end;
$$;

-- ---------------------------------------------------------------------------
-- Extend accept_invitation: also record the initial role assignment on birth,
-- department-scoped when the role is department-scoped and the invite named one.
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
  else
    v_meta := v_meta || jsonb_build_object('plane', 'org', 'tenant_id', inv.tenant_id::text);
    -- Record the initial org role assignment (department-scoped where applicable).
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

-- ---- grants: org RPCs callable by authenticated (authority checked inside) ----
revoke all on function public.accept_invitation(text, uuid, text, text, text) from public;
grant execute on function public.accept_invitation(text, uuid, text, text, text) to service_role;

revoke all on function public.grant_role(uuid, text, uuid) from public;
revoke all on function public.revoke_role(uuid, text, uuid) from public;
revoke all on function public.create_department(text) from public;
revoke all on function public.assign_hod(uuid, uuid) from public;
revoke all on function public.org_invite_user(text, text, uuid, jsonb) from public;
revoke all on function public.org_deactivate_user(uuid, text) from public;
grant execute on function public.grant_role(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.revoke_role(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.create_department(text) to authenticated, service_role;
grant execute on function public.assign_hod(uuid, uuid) to authenticated, service_role;
grant execute on function public.org_invite_user(text, text, uuid, jsonb) to authenticated, service_role;
grant execute on function public.org_deactivate_user(uuid, text) to authenticated, service_role;

-- SoD primitive exposed for later phases/tests (read-only checks).
grant execute on function app.sod_ok(uuid, uuid) to authenticated, service_role;
grant execute on function app.enforce_sod(uuid, uuid, text) to authenticated, service_role;
