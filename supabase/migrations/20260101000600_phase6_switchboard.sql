-- ============================================================================
-- Phase 6 — Module switchboard & the proving seam
-- Proves the modularity architecture end to end: the seam contract (trigger +
-- coupling), one real coupling seam (training) with a stub/default, the swap-test
-- (system runs correctly whether the module is on, off, or absent), the in-flight
-- switch policy, and the org's read-only module view with a request-a-change path.
-- The document-control core (next plan) plugs into exactly these seams.
-- ============================================================================

-- Connectability rule: a module that does not write audit is not connectable.
alter table public.modules add column if not exists audit_compliant boolean not null default true;

-- Register the proving-seam module (the full training module is a later plan).
insert into public.modules (key, label, description, audit_compliant) values
  ('training', 'Training / LMS', 'At the effective window, answers whether training is required and met.', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- In-flight switch policy: a flow snapshots the module setting when it engages
-- the seam, and resolves against that snapshot until it closes. New flows read
-- the live setting. So flipping a module mid-flight never yanks it from a running
-- flow (FOUNDATIONS §1.6).
-- ---------------------------------------------------------------------------
create table if not exists public.seam_flows (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id),
  module_key       text not null references public.modules(key),
  engaged_setting  jsonb not null,        -- snapshot: {enabled, config}
  started_at       timestamptz not null default now(),
  closed_at        timestamptz
);

-- Trigger seam (inbound): the defined entry point a module (or manual intake) calls
-- to start something in the core. No trigger modules attached yet — manual intake
-- uses it identically (settled decision). The core doesn't care who raised it.
create table if not exists public.change_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  origin       text not null,             -- 'manual' | module key (e.g. 'capa')
  payload      jsonb not null default '{}'::jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now()
);

-- Org's request-a-change path back to the platform switchboard (read-only for org).
create table if not exists public.module_change_requests (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id),
  module_key      text not null references public.modules(key),
  desired_enabled boolean not null,
  note            text,
  requested_by    uuid,
  status          text not null default 'open' check (status in ('open','resolved')),
  created_at      timestamptz not null default now()
);

-- ---- RLS: tenant-scoped; platform reads via is_platform() ----
alter table public.seam_flows             enable row level security;
alter table public.change_requests        enable row level security;
alter table public.module_change_requests enable row level security;
alter table public.seam_flows             force row level security;
alter table public.change_requests        force row level security;
alter table public.module_change_requests force row level security;

drop policy if exists seam_flows_read on public.seam_flows;
create policy seam_flows_read on public.seam_flows for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists change_requests_read on public.change_requests;
create policy change_requests_read on public.change_requests for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists module_change_requests_read on public.module_change_requests;
create policy module_change_requests_read on public.module_change_requests for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform());

grant select on public.seam_flows, public.change_requests, public.module_change_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Enforce the connectability rule when enabling a module (rule from §2.5).
-- ---------------------------------------------------------------------------
create or replace function app.assert_connectable() returns trigger
language plpgsql set search_path = app, public as $$
begin
  if new.enabled and not (select audit_compliant from public.modules where key = new.module_key) then
    raise exception 'module % is not audit-compliant and cannot be enabled', new.module_key;
  end if;
  return new;
end;
$$;
drop trigger if exists assert_connectable on public.tenant_modules;
create trigger assert_connectable before insert or update on public.tenant_modules
  for each row execute function app.assert_connectable();

-- ---------------------------------------------------------------------------
-- Seam mechanics.
--   begin_seam_flow  — snapshot the live setting (in-flight isolation)
--   module_enabled   — live on/off for a tenant+module
--   resolve_training — the coupling seam: defer to the module, else safe default
--   close_seam_flow  — end the flow
-- ---------------------------------------------------------------------------
create or replace function app.module_enabled(p_tenant uuid, p_module text) returns boolean
language sql stable security definer set search_path = app, public
as $$ select coalesce((select enabled from public.tenant_modules
                       where tenant_id=p_tenant and module_key=p_module), false); $$;

create or replace function app.begin_seam_flow(p_tenant uuid, p_module text) returns uuid
language plpgsql security definer set search_path = app, public as $$
declare v_id uuid; v_snap jsonb;
begin
  select jsonb_build_object('enabled', coalesce(enabled,false), 'config', coalesce(config,'{}'::jsonb))
    into v_snap from public.tenant_modules where tenant_id=p_tenant and module_key=p_module;
  v_snap := coalesce(v_snap, jsonb_build_object('enabled', false, 'config', '{}'::jsonb));
  insert into public.seam_flows(tenant_id, module_key, engaged_setting)
    values (p_tenant, p_module, v_snap) returning id into v_id;
  return v_id;
end; $$;

create or replace function app.close_seam_flow(p_flow uuid) returns void
language sql security definer set search_path = app, public
as $$ update public.seam_flows set closed_at = now() where id = p_flow and closed_at is null; $$;

-- The training COUPLING SEAM. Returns the core's answer with its source. When the
-- module is off/absent it uses the DEFAULT ("no training required") so the flow
-- always has a way forward. When on, it defers to the module's (mock) answer.
-- If p_flow is given and open, resolution uses that flow's snapshot (in-flight).
create or replace function app.resolve_training(p_tenant uuid, p_flow uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare v_enabled boolean; v_config jsonb; v_snap jsonb;
begin
  if p_flow is not null then
    select engaged_setting into v_snap from public.seam_flows where id = p_flow and closed_at is null;
  end if;
  if v_snap is not null then
    v_enabled := (v_snap->>'enabled')::boolean;
    v_config  := coalesce(v_snap->'config', '{}'::jsonb);
  else
    v_enabled := app.module_enabled(p_tenant, 'training');
    select coalesce(config,'{}'::jsonb) into v_config
      from public.tenant_modules where tenant_id=p_tenant and module_key='training';
  end if;

  if not coalesce(v_enabled, false) then
    -- DEFAULT RESOLUTION (module off/absent): training is simply not a gate.
    return jsonb_build_object('required', false, 'threshold_met', true, 'source', 'default');
  end if;

  -- Module ON — mock real implementation: training required; threshold met only if
  -- the module says so (real training module replaces this in a later plan).
  return jsonb_build_object(
    'required', true,
    'threshold_met', coalesce((v_config->>'assume_met')::boolean, false),
    'source', 'module');
end; $$;

-- A representative core flow that TOUCHES the seam — used by the swap-test. It runs
-- identically whether training is on or off; only the outcome differs, and it never
-- fails. off → goes effective (no gate); on → pending until training met.
create or replace function app.demo_effective_flow(p_tenant uuid) returns text
language plpgsql security definer set search_path = app, public as $$
declare v_flow uuid; v_ans jsonb; v_outcome text;
begin
  v_flow := app.begin_seam_flow(p_tenant, 'training');
  v_ans  := app.resolve_training(p_tenant, v_flow);
  if (v_ans->>'required')::boolean and not (v_ans->>'threshold_met')::boolean then
    v_outcome := 'pending_training';
  else
    v_outcome := 'effective';
  end if;
  perform app.close_seam_flow(v_flow);
  return v_outcome;
end; $$;

-- Trigger seam entry point: raise a change request into the core. Any module or
-- manual intake calls this identically. Audited (a non-auditing caller can't use it).
create or replace function app.raise_change_request(
  p_tenant uuid, p_origin text, p_payload jsonb, p_actor uuid) returns uuid
language plpgsql security definer set search_path = app, public as $$
declare v_id uuid;
begin
  insert into public.change_requests(tenant_id, origin, payload, created_by)
    values (p_tenant, p_origin, coalesce(p_payload,'{}'::jsonb), p_actor) returning id into v_id;
  perform app.write_audit('core.change_request_raised', p_actor, null, p_tenant, null, null,
    'change_request', v_id::text, null, jsonb_build_object('origin', p_origin), null, 'trigger-seam');
  return v_id;
end; $$;

-- ---------------------------------------------------------------------------
-- Org request-a-change (read-only switchboard for org; the platform holds the switch).
-- ---------------------------------------------------------------------------
create or replace function public.request_module_change(
  p_module text, p_desired_enabled boolean, p_note text)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_id uuid;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'request_module_change: caller is not an org user'; end if;
  if not app.can_provision_users(v_caller) then
    raise exception 'request_module_change: QA or Org-Admin only';
  end if;
  insert into public.module_change_requests(tenant_id, module_key, desired_enabled, note, requested_by)
    values (v_ctx.tenant_id, p_module, p_desired_enabled, p_note, v_caller) returning id into v_id;
  perform app.write_audit('module.change_requested', v_caller, null, v_ctx.tenant_id, v_ctx.org_id, null,
    'module_change_request', v_id::text, null,
    jsonb_build_object('module', p_module, 'desired_enabled', p_desired_enabled), p_note, 'S-MODULES-ORG');
  return v_id;
end; $$;

revoke all on function public.request_module_change(text, boolean, text) from public;
grant execute on function public.request_module_change(text, boolean, text) to authenticated, service_role;
grant execute on function app.demo_effective_flow(uuid), app.resolve_training(uuid, uuid),
  app.raise_change_request(uuid, text, jsonb, uuid) to service_role;
