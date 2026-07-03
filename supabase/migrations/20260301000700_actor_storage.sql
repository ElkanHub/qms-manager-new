-- ============================================================================
-- (1) The actor is NEVER blank on the audit trail (going forward).
--
-- write_audit v2 resolves a display actor for every entry at write time:
-- the passed email, else the actor's email from the directory, else the
-- actor id itself, else 'System (automatic)' when there is genuinely no
-- authenticated context (triggers, schedulers). AI-assisted actions already
-- run in the requesting user's context (the AI side is on ai_gateway_log).
--
-- Historical rows cannot be rewritten — the trail is append-only and
-- hash-chained; editing history would break the tamper-evidence. The audit
-- viewer renders old null actors as "System (automatic)".
--
-- (2) SOP file storage accounting: uploaded Word files live in the project's
-- storage bucket; every stored file is registered here so per-tenant usage is
-- tracked and capped. Limits are platform-controlled (default 1 GB).
-- ============================================================================

create or replace function app.write_audit(
  p_action        text,
  p_actor_id      uuid    default null,
  p_actor_email   text    default null,
  p_tenant_id     uuid    default null,
  p_org_id        uuid    default null,
  p_department_id uuid    default null,
  p_entity_type   text    default null,
  p_entity_id     text    default null,
  p_old           jsonb   default null,
  p_new           jsonb   default null,
  p_reason        text    default null,
  p_source        text    default null,
  p_session_id    text    default null,
  p_request_id    text    default null,
  p_metadata      jsonb   default '{}'::jsonb,
  p_require_reason boolean default false
) returns bigint
language plpgsql
security definer
set search_path = app, public, extensions
as $$
declare
  v_occurred timestamptz := clock_timestamp();   -- contemporaneous server time
  v_actor    uuid := coalesce(p_actor_id, auth.uid());
  v_email    text;
  v_chain    text := coalesce(p_tenant_id::text, 'platform');
  v_prev     bytea;
  v_content  text;
  v_hash     bytea;
  v_id       bigint;
begin
  if p_action is null or length(trim(p_action)) = 0 then
    raise exception 'audit: action is required';
  end if;
  if p_require_reason and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'audit: a reason is required for action %', p_action;
  end if;

  -- The actor always shows: explicit email > directory email > the id itself
  -- > the explicit system marker. Never null on a new entry.
  v_email := coalesce(
    nullif(trim(coalesce(p_actor_email, '')), ''),
    (select u.email from public.users u where u.id = v_actor),
    (select au.email from auth.users au where au.id = v_actor),
    case when v_actor is not null then v_actor::text end,
    'System (automatic)');

  -- Serialize concurrent writers on this chain so prev_hash is consistent.
  perform pg_advisory_xact_lock(hashtextextended(v_chain, 0));

  select entry_hash into v_prev
  from public.audit_trail
  where chain_key = v_chain
  order by id desc
  limit 1;

  if v_prev is null then
    v_prev := digest('qms-audit-genesis:' || v_chain, 'sha256');   -- per-chain genesis
  end if;

  v_content := app.audit_content(v_occurred, v_actor, v_email, p_action,
    p_tenant_id, p_org_id, p_department_id, p_entity_type, p_entity_id,
    p_old, p_new, p_reason, p_source, p_session_id, p_request_id, coalesce(p_metadata, '{}'::jsonb));

  v_hash := digest(v_prev || convert_to(v_content, 'UTF8'), 'sha256');

  perform set_config('app.audit_write', 'on', true);   -- sanction this one insert
  insert into public.audit_trail(
    occurred_at, actor_id, actor_email, action, chain_key,
    tenant_id, org_id, department_id, entity_type, entity_id,
    old_value, new_value, reason, source, session_id, request_id, metadata,
    prev_hash, entry_hash)
  values (v_occurred, v_actor, v_email, p_action, v_chain,
    p_tenant_id, p_org_id, p_department_id, p_entity_type, p_entity_id,
    p_old, p_new, p_reason, p_source, p_session_id, p_request_id, coalesce(p_metadata, '{}'::jsonb),
    v_prev, v_hash)
  returning id into v_id;
  perform set_config('app.audit_write', 'off', true);  -- close the window immediately

  return v_id;
end;
$$;

-- ---- SOP file storage accounting ----
create table if not exists public.stored_files (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  path        text not null unique,       -- bucket-relative object path
  bytes       bigint not null check (bytes > 0),
  document_id uuid,
  uploaded_by uuid not null,
  created_at  timestamptz not null default now()
);
create index if not exists stored_files_tenant_idx on public.stored_files (tenant_id);
alter table public.stored_files enable row level security;
alter table public.stored_files force row level security;
drop policy if exists stored_files_read on public.stored_files;
create policy stored_files_read on public.stored_files for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.stored_files to authenticated;

-- Platform-controlled per-tenant cap. No row = the 1 GB default.
create table if not exists public.tenant_storage_limits (
  tenant_id  uuid primary key references public.tenants(id),
  max_bytes  bigint not null default 1073741824 check (max_bytes > 0),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.tenant_storage_limits enable row level security;
alter table public.tenant_storage_limits force row level security;
drop policy if exists storage_limits_read on public.tenant_storage_limits;
create policy storage_limits_read on public.tenant_storage_limits for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.tenant_storage_limits to authenticated;

create or replace function app.storage_usage(p_tenant uuid) returns bigint
language sql stable security definer set search_path = app, public as $$
  select coalesce(sum(bytes), 0)::bigint from public.stored_files where tenant_id = p_tenant;
$$;
create or replace function app.storage_limit(p_tenant uuid) returns bigint
language sql stable security definer set search_path = app, public as $$
  select coalesce((select max_bytes from public.tenant_storage_limits where tenant_id = p_tenant),
                  1073741824)::bigint;
$$;
grant execute on function app.storage_usage(uuid), app.storage_limit(uuid) to authenticated, service_role;

-- Register an uploaded file against the tenant's cap. The upload route calls
-- this BEFORE finalizing; a refusal means the object is removed again.
create or replace function public.register_stored_file(p_path text, p_bytes bigint, p_document uuid default null)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_id uuid; begin
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'register_stored_file: no org context'; end if;
  if coalesce(p_bytes, 0) <= 0 then raise exception 'register_stored_file: empty file'; end if;
  perform app.assert_word_ref(p_path);   -- the Word-only rule holds in storage too
  if app.storage_usage(v_ctx.tenant_id) + p_bytes > app.storage_limit(v_ctx.tenant_id) then
    raise exception 'register_stored_file: storage limit reached (% of % bytes used) — contact your platform administrator',
      app.storage_usage(v_ctx.tenant_id), app.storage_limit(v_ctx.tenant_id);
  end if;
  insert into public.stored_files(tenant_id, path, bytes, document_id, uploaded_by)
    values (v_ctx.tenant_id, p_path, p_bytes, p_document, v_caller)
    returning id into v_id;
  perform app.write_audit('storage.file_registered', v_caller, null, v_ctx.tenant_id, v_ctx.org_id, v_ctx.department_id,
    'stored_file', v_id::text, null, jsonb_build_object('path', p_path, 'bytes', p_bytes), null, 'D-UPLOAD');
  return v_id;
end; $$;
revoke all on function public.register_stored_file(text, bigint, uuid) from public;
grant execute on function public.register_stored_file(text, bigint, uuid) to authenticated, service_role;

-- Platform admin sets a tenant's cap (audited on the tenant's own chain).
create or replace function public.set_tenant_storage_limit(p_tenant uuid, p_max_bytes bigint)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_old bigint; begin
  if not (app.is_platform_owner(v_caller) or app.has_platform_scope(v_caller, 'switchboard')) then
    raise exception 'set_tenant_storage_limit: platform owner/switchboard scope only'; end if;
  if coalesce(p_max_bytes, 0) <= 0 then raise exception 'set_tenant_storage_limit: a positive limit is required'; end if;
  v_old := app.storage_limit(p_tenant);
  insert into public.tenant_storage_limits(tenant_id, max_bytes, updated_by, updated_at)
    values (p_tenant, p_max_bytes, v_caller, now())
    on conflict (tenant_id) do update set max_bytes = excluded.max_bytes, updated_by = v_caller, updated_at = now();
  perform app.write_audit('storage.limit_set', v_caller, null, p_tenant, null, null,
    'tenant_storage_limit', p_tenant::text, jsonb_build_object('max_bytes', v_old),
    jsonb_build_object('max_bytes', p_max_bytes), null, 'S-PLATFORM-STORAGE');
end; $$;
revoke all on function public.set_tenant_storage_limit(uuid, bigint) from public;
grant execute on function public.set_tenant_storage_limit(uuid, bigint) to authenticated, service_role;
