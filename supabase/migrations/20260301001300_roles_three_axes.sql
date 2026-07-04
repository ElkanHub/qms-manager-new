-- ============================================================================
-- Roles v2 — the three-axis permission model.
--
-- Axis 1: DEPARTMENT. QA is the root department (departments.is_default), not a
--         role — membership in it is what confers approval/release authority.
-- Axis 2: PRIMARY ROLE. hod (HOD/Manager) and org_admin are assignable; the
--         ordinary employee is the baseline (no row at all).
-- Axis 3: CAPABILITIES. signatory and trainer attach on top of a role, per
--         person. Role defaults (HOD/Org-Admin → signatory + trainer) pre-fill
--         in the UI; the per-person grant is the source of truth.
--
-- Approver, Author and Viewer are RETIRED as assignable roles:
--   approver → approval authority = QA-department membership;
--   author   → authoring/submitting is a universal action, open to members;
--   viewer   → the baseline of every ordinary employee, never assigned.
--
-- Guards that hold regardless of configuration:
--   * only QA-department membership confers approval authority — no capability
--     grant can ever produce it;
--   * SoD stays action-level (app.enforce_sod) — a QA author cannot self-approve;
--   * QA-department membership and the signatory capability are QA-granted only
--     (the existing delegation boundary);
--   * every assignment and per-person override is audited old → new.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (1) Catalogue: classify every role key by its axis.
-- ---------------------------------------------------------------------------
alter table public.roles add column if not exists kind text not null default 'retired';
alter table public.roles drop constraint if exists roles_kind_check;
alter table public.roles add constraint roles_kind_check
  check (kind in ('primary','capability','authority','retired'));

update public.roles set kind = 'primary'    where key in ('hod','org_admin');
update public.roles set kind = 'capability' where key in ('signatory','trainer');
update public.roles set kind = 'authority'  where key = 'qa';   -- conferred by QA-dept membership
update public.roles set kind = 'retired'    where key in ('approver','author','viewer');

-- The trainer capability is a per-person, org-wide grant (not department-scoped).
update public.roles set department_scoped = false where key = 'trainer';

-- HOD reads as "HOD / Manager" everywhere (one role, two names).
update public.roles set label = 'HOD / Manager' where key = 'hod';

-- ---------------------------------------------------------------------------
-- (2) Remove existing assignments of retired keys (they confer nothing anywhere
-- in the system — catalogue-only). Each removal is audited as a system action.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select ur.user_id, ur.tenant_id, ur.role, ur.department_id, u.org_id
    from public.user_roles ur
    join public.users u on u.id = ur.user_id
    where ur.role in ('approver','author','viewer')
  loop
    delete from public.user_roles
     where user_id = r.user_id and role = r.role
       and department_id is not distinct from r.department_id;
    perform app.write_audit('role.retired_removed', null, null,
      r.tenant_id, r.org_id, r.department_id, 'user_role', r.user_id::text,
      jsonb_build_object('role', r.role, 'department_id', r.department_id),
      jsonb_build_object('model', 'roles v2 three-axis'),
      'approver/author/viewer retired: approval = QA-department membership, authoring is universal, viewing is the employee baseline',
      'S-USERS');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- (3) QA authority = QA-department membership. The root department created at
-- provisioning (departments.is_default) is the quality department. The 'qa'
-- marker row in user_roles is kept in lockstep with membership by every
-- membership pathway (invite acceptance, department moves, the backfill below),
-- so app.is_qa and every consumer of it agree with membership by construction.
-- ---------------------------------------------------------------------------
create or replace function app.is_quality_department(p_department uuid) returns boolean
language sql stable security definer set search_path = app, public
as $$ select coalesce((select is_default from public.departments where id = p_department), false); $$;

-- app.is_qa keeps reading the 'qa' marker (every authority check in the system
-- goes through it); the sync below makes membership and the marker one thing.
create or replace function app.sync_qa_marker(p_user uuid, p_actor uuid, p_source text)
returns void
language plpgsql security definer set search_path = app, public
as $$
declare v_ctx record; v_member boolean; v_marked boolean;
begin
  select * into v_ctx from app.actor_context(p_user);
  v_member := app.is_quality_department(v_ctx.department_id);
  select exists(select 1 from public.user_roles where user_id = p_user and role = 'qa') into v_marked;

  if v_member and not v_marked then
    insert into public.user_roles(user_id, tenant_id, role, department_id, granted_by)
    values (p_user, v_ctx.tenant_id, 'qa', null, p_actor)
    on conflict do nothing;
    perform app.write_audit('qa_membership.granted', p_actor, null,
      v_ctx.tenant_id, v_ctx.org_id, v_ctx.department_id, 'user_role', p_user::text,
      null, jsonb_build_object('authority', 'qa', 'via', 'quality-department membership'),
      null, p_source);
  elsif not v_member and v_marked then
    delete from public.user_roles where user_id = p_user and role = 'qa';
    perform app.write_audit('qa_membership.revoked', p_actor, null,
      v_ctx.tenant_id, v_ctx.org_id, v_ctx.department_id, 'user_role', p_user::text,
      jsonb_build_object('authority', 'qa'), null, null, p_source);
  end if;
end;
$$;

-- Backfill: anyone already sitting in a quality department gets the marker now
-- (system action, audited by the sync itself).
do $$
declare r record;
begin
  for r in
    select u.id from public.users u
    join public.departments d on d.id = u.department_id
    where d.is_default and u.plane = 'org'
      and not exists (select 1 from public.user_roles ur where ur.user_id = u.id and ur.role = 'qa')
  loop
    perform app.sync_qa_marker(r.id, null, 'S-USERS');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- (4) Axis 1 — set_user_department. Moves that touch the quality department
-- (in OR out), or move a current QA-authority holder, are QA-only; everything
-- else is QA or Org-Admin. The 'qa' marker syncs with the move. Audited old → new.
-- ---------------------------------------------------------------------------
create or replace function public.set_user_department(p_target_user uuid, p_department uuid)
returns void
language plpgsql security definer set search_path = app, public
as $$
declare
  v_caller uuid := auth.uid();
  v_ctx    record;
  v_tctx   record;
  v_old    uuid;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'set_user_department: caller is not an org user'; end if;
  select * into v_tctx from app.actor_context(p_target_user);
  if v_tctx.tenant_id is distinct from v_ctx.tenant_id then
    raise exception 'set_user_department: target is in a different tenant';
  end if;
  if p_department is not null and not exists (
    select 1 from public.departments d where d.id = p_department and d.tenant_id = v_ctx.tenant_id
  ) then
    raise exception 'set_user_department: unknown department';
  end if;

  v_old := v_tctx.department_id;
  if v_old is not distinct from p_department then return; end if;

  if app.is_quality_department(p_department)
     or app.is_quality_department(v_old)
     or app.has_role(p_target_user, 'qa') then
    if not app.is_qa(v_caller) then
      raise exception 'set_user_department: QA-department membership confers approval authority — QA only';
    end if;
  elsif not app.can_provision_users(v_caller) then
    raise exception 'set_user_department: QA or Org-Admin only';
  end if;

  update public.users set department_id = p_department where id = p_target_user;

  perform app.write_audit('user.department_changed', v_caller, null,
    v_ctx.tenant_id, v_tctx.org_id, p_department, 'user', p_target_user::text,
    jsonb_build_object('department_id', v_old),
    jsonb_build_object('department_id', p_department,
                       'confers_qa_authority', app.is_quality_department(p_department)),
    null, 'S-USERS');

  perform app.sync_qa_marker(p_target_user, v_caller, 'S-USERS');
end;
$$;

-- ---------------------------------------------------------------------------
-- (5) Axis 2 — set_primary_role. 'employee' is the baseline (clears both
-- primary roles); 'hod' needs a department (defaults to the target's own).
-- QA or Org-Admin. Audited old → new in one entry.
-- ---------------------------------------------------------------------------
create or replace function public.set_primary_role(
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
  v_dept   uuid;
  v_old    jsonb;
begin
  if p_role not in ('employee','hod','org_admin') then
    raise exception 'set_primary_role: the primary role is employee (baseline), hod, or org_admin';
  end if;
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'set_primary_role: caller is not an org user'; end if;
  select * into v_tctx from app.actor_context(p_target_user);
  if v_tctx.tenant_id is distinct from v_ctx.tenant_id then
    raise exception 'set_primary_role: target is in a different tenant';
  end if;
  if not app.can_provision_users(v_caller) then
    raise exception 'set_primary_role: QA or Org-Admin only';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('role', role, 'department_id', department_id)), '[]'::jsonb)
    into v_old
  from public.user_roles
  where user_id = p_target_user and role in ('hod','org_admin');

  delete from public.user_roles where user_id = p_target_user and role in ('hod','org_admin');

  if p_role = 'hod' then
    v_dept := coalesce(p_department, v_tctx.department_id);
    if v_dept is null then raise exception 'set_primary_role: a HOD/Manager needs a department'; end if;
    insert into public.user_roles(user_id, tenant_id, role, department_id, granted_by)
    values (p_target_user, v_ctx.tenant_id, 'hod', v_dept, v_caller);
  elsif p_role = 'org_admin' then
    insert into public.user_roles(user_id, tenant_id, role, department_id, granted_by)
    values (p_target_user, v_ctx.tenant_id, 'org_admin', null, v_caller);
  end if;

  perform app.write_audit('role.primary_set', v_caller, null,
    v_ctx.tenant_id, v_tctx.org_id, v_dept, 'user_role', p_target_user::text,
    v_old, jsonb_build_object('role', p_role, 'department_id', v_dept),
    null, 'S-USERS');
end;
$$;

-- ---------------------------------------------------------------------------
-- (6) Axis 3 — set_capability. Per-person grant/removal of signatory and
-- trainer, regardless of the default for the person's role. Signatory is
-- quality-critical (QA-only); trainer is QA or Org-Admin. A capability grant
-- can never confer approval authority (that is QA-department membership only).
-- Audited old → new.
-- ---------------------------------------------------------------------------
create or replace function public.set_capability(
  p_target_user uuid,
  p_capability  text,
  p_granted     boolean
) returns void
language plpgsql security definer set search_path = app, public
as $$
declare
  v_caller uuid := auth.uid();
  v_ctx    record;
  v_tctx   record;
  v_had    boolean;
begin
  if p_capability not in ('signatory','trainer') then
    raise exception 'set_capability: capability must be signatory or trainer';
  end if;
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'set_capability: caller is not an org user'; end if;
  select * into v_tctx from app.actor_context(p_target_user);
  if v_tctx.tenant_id is distinct from v_ctx.tenant_id then
    raise exception 'set_capability: target is in a different tenant';
  end if;
  if p_capability = 'signatory' then
    if not app.is_qa(v_caller) then
      raise exception 'set_capability: signatory is quality-critical — QA only';
    end if;
  elsif not app.can_provision_users(v_caller) then
    raise exception 'set_capability: QA or Org-Admin only';
  end if;

  select exists(select 1 from public.user_roles where user_id = p_target_user and role = p_capability)
    into v_had;
  if p_granted and not v_had then
    insert into public.user_roles(user_id, tenant_id, role, department_id, granted_by)
    values (p_target_user, v_ctx.tenant_id, p_capability, null, v_caller);
  elsif not p_granted and v_had then
    delete from public.user_roles where user_id = p_target_user and role = p_capability;
  else
    return;   -- no change; nothing to audit
  end if;

  perform app.write_audit(
    case when p_granted then 'capability.granted' else 'capability.revoked' end,
    v_caller, null, v_ctx.tenant_id, v_tctx.org_id, null, 'user_role', p_target_user::text,
    jsonb_build_object('capability', p_capability, 'granted', v_had),
    jsonb_build_object('capability', p_capability, 'granted', p_granted),
    null, 'S-USERS');
end;
$$;

-- ---------------------------------------------------------------------------
-- (7) grant_role — refuse retired keys going forward (same signature, same
-- delegation boundary otherwise). revoke_role stays as-is so leftovers can
-- always be cleaned up.
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
  v_kind   text;
begin
  select * into v_ctx from app.actor_context(v_caller);
  select * into v_tctx from app.actor_context(p_target_user);
  if v_ctx.tenant_id is null then raise exception 'grant_role: caller is not an org user'; end if;
  if v_tctx.tenant_id is distinct from v_ctx.tenant_id then
    raise exception 'grant_role: target is in a different tenant';
  end if;

  select quality_critical, kind into v_critical, v_kind from public.roles where key = p_role;
  if v_critical is null then raise exception 'grant_role: unknown role %', p_role; end if;
  if v_kind = 'retired' then
    raise exception 'grant_role: "%" is retired — approval authority comes from QA-department membership, authoring is open to every member, and viewing is the employee baseline', p_role;
  end if;

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

-- ---------------------------------------------------------------------------
-- (8) org_invite_user — invites now name a department plus a primary role
-- ('employee' baseline, 'hod', 'org_admin'). Retired keys are refused; inviting
-- into the quality department is QA-only (membership confers authority).
-- ---------------------------------------------------------------------------
create or replace function public.org_invite_user(
  p_email       text,
  p_role        text,
  p_department  uuid default null,
  p_scope       jsonb default '{}'::jsonb
) returns table(invitation_id uuid, token text)
language plpgsql security definer set search_path = app, public
as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_critical boolean; v_kind text; v_inv record;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'org_invite_user: caller is not an org user'; end if;

  if p_role <> 'employee' then
    select quality_critical, kind into v_critical, v_kind from public.roles where key = p_role;
    if v_critical is null then raise exception 'org_invite_user: unknown role %', p_role; end if;
    if v_kind = 'retired' then
      raise exception 'org_invite_user: "%" is retired — invite as employee; viewing is the baseline and authoring is open to every member', p_role;
    end if;
    if v_critical and not app.is_qa(v_caller) then
      raise exception 'org_invite_user: quality-critical roles are QA-only';
    end if;
  end if;

  if app.is_quality_department(p_department) and not app.is_qa(v_caller) then
    raise exception 'org_invite_user: inviting into the QA department is QA-only (membership confers approval authority)';
  end if;
  if not app.can_provision_users(v_caller) then
    raise exception 'org_invite_user: QA or Org-Admin only';
  end if;

  select * into v_inv from app.create_invitation(
    p_email, 'org', p_role, v_ctx.tenant_id, v_ctx.org_id, p_department, p_scope, v_caller, null,
    interval '7 days', 'S-INVITE');
  invitation_id := v_inv.id; token := v_inv.token; return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- (9) accept_invitation — role-at-birth only materializes for live kinds
-- (primary/capability/authority); 'employee' and retired keys yield the
-- baseline. Joining a quality department syncs the QA marker at birth.
-- Platform-plane behaviour is unchanged from phase 5.
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
  v_kind text;
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
    select department_scoped, kind into v_dept_scoped, v_kind
      from public.roles where key = inv.initial_role;
    if v_kind in ('primary','capability','authority') then
      insert into public.user_roles(user_id, tenant_id, role, department_id, granted_by)
      values (p_user_id, inv.tenant_id, inv.initial_role,
              case when v_dept_scoped then inv.department_id else null end, inv.invited_by)
      on conflict do nothing;
    end if;
    -- Joining the quality department confers QA authority at birth.
    perform app.sync_qa_marker(p_user_id, inv.invited_by, coalesce(p_source, 'S-INVITE'));
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
-- (10) Classification matrix — required signing roles must be live keys
-- (retired keys can no longer be demanded; 'approver' slots would be
-- unsatisfiable). Behaviour otherwise unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.set_classification_matrix(p_class text, p_roles text[])
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_bad text;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if not app.is_qa(v_caller) then raise exception 'set_classification_matrix: QA only'; end if;

  select rk into v_bad
  from unnest(p_roles) rk
  left join public.roles r on r.key = rk
  where r.key is null or r.kind = 'retired'
  limit 1;
  if v_bad is not null then
    raise exception 'set_classification_matrix: "%" is not an active signing role (approver/author/viewer are retired)', v_bad;
  end if;

  insert into public.classification_matrix(tenant_id, class, required_roles)
    values (v_ctx.tenant_id, p_class, p_roles)
    on conflict (tenant_id, class) do update set required_roles = excluded.required_roles;
  perform app.write_audit('classification.matrix_set', v_caller, null, v_ctx.tenant_id, v_ctx.org_id, null,
    'classification_matrix', p_class, null, jsonb_build_object('roles', to_jsonb(p_roles)), null, 'D-CLASSIFY');
end; $$;

-- ---- grants ----
revoke all on function public.set_user_department(uuid, uuid) from public;
revoke all on function public.set_primary_role(uuid, text, uuid) from public;
revoke all on function public.set_capability(uuid, text, boolean) from public;
grant execute on function public.set_user_department(uuid, uuid) to authenticated, service_role;
grant execute on function public.set_primary_role(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.set_capability(uuid, text, boolean) to authenticated, service_role;
