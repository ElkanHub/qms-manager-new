-- ============================================================================
-- Onboarding — the configurable flow a user goes through right after accepting
-- their invitation. Config lives on the platform admin board (per tenant); the
-- flow is stored as DATA (steps + fields), so new pages/fields need no code change.
-- Follows the foundation's rules: platform-controlled config, tenant-scoped RLS,
-- every controlled action audited.
-- ============================================================================

-- A user is "onboarded" once they complete the flow (null = not yet).
alter table public.users add column if not exists onboarded_at timestamptz;

-- Per-tenant onboarding definition. `steps` is an ordered array of pages; each page
-- has fields. Shape (validated in the app editor, rendered natively):
--   [ { "key":"profile", "title":"Your profile",
--       "fields":[ {"key":"phone","label":"Phone","type":"text","required":true},
--                  {"key":"shift","label":"Shift","type":"select","required":false,
--                   "options":["Day","Night"]} ] } ]
create table if not exists public.onboarding_flows (
  tenant_id  uuid primary key references public.tenants(id),
  steps      jsonb not null default '[]'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- The data collected from each user (one response per user).
create table if not exists public.onboarding_responses (
  user_id      uuid primary key references public.users(id),
  tenant_id    uuid not null references public.tenants(id),
  answers      jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);

drop trigger if exists freeze_tenant_id on public.onboarding_responses;
create trigger freeze_tenant_id before update on public.onboarding_responses
  for each row execute function app.freeze_tenant_id();

-- ---- RLS ----
alter table public.onboarding_flows     enable row level security;
alter table public.onboarding_responses enable row level security;
alter table public.onboarding_flows     force row level security;
alter table public.onboarding_responses force row level security;

-- The flow is readable by its tenant's users (they render it) and by platform users.
drop policy if exists onboarding_flows_read on public.onboarding_flows;
create policy onboarding_flows_read on public.onboarding_flows for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_platform());

-- A response is visible to the user themselves, and to a platform admin holding an
-- open break-glass session (who configured the flow). Broader org review is a later screen.
drop policy if exists onboarding_responses_read on public.onboarding_responses;
create policy onboarding_responses_read on public.onboarding_responses for select to authenticated
  using (user_id = auth.uid()
         or (public.is_platform() and app.has_open_gate(tenant_id, auth.uid())));

grant select on public.onboarding_flows, public.onboarding_responses to authenticated;

-- ---------------------------------------------------------------------------
-- set_onboarding_flow — platform configures a tenant's flow. Reuses the
-- switchboard scope (onboarding config is switchboard-adjacent config). Audited.
-- ---------------------------------------------------------------------------
create or replace function public.set_onboarding_flow(p_tenant uuid, p_steps jsonb)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_old jsonb;
begin
  if not app.has_platform_scope(v_caller, 'switchboard') then
    raise exception 'set_onboarding_flow: requires switchboard scope';
  end if;
  if jsonb_typeof(p_steps) <> 'array' then
    raise exception 'set_onboarding_flow: steps must be a JSON array';
  end if;
  select steps into v_old from public.onboarding_flows where tenant_id = p_tenant;
  insert into public.onboarding_flows(tenant_id, steps, updated_by, updated_at)
    values (p_tenant, p_steps, v_caller, now())
    on conflict (tenant_id) do update set steps = excluded.steps, updated_by = v_caller, updated_at = now();
  perform app.write_audit('onboarding.flow_set', v_caller, null, p_tenant, null, null,
    'onboarding_flow', p_tenant::text, v_old, p_steps, null, 'S-ONBOARDING');
end; $$;

-- ---------------------------------------------------------------------------
-- submit_onboarding — the org user submits their answers. Validates that every
-- required field across the flow's steps is present, records the data, marks the
-- user onboarded, and audits. If the tenant has no flow, it simply marks onboarded.
-- ---------------------------------------------------------------------------
create or replace function public.submit_onboarding(p_answers jsonb)
returns void language plpgsql security definer set search_path = app, public as $$
declare
  v_user uuid := auth.uid();
  v_ctx  record;
  v_steps jsonb;
  v_step jsonb;
  v_field jsonb;
  v_key text;
begin
  select * into v_ctx from app.actor_context(v_user);
  if v_ctx.tenant_id is null then raise exception 'submit_onboarding: not an org user'; end if;

  select steps into v_steps from public.onboarding_flows where tenant_id = v_ctx.tenant_id;

  -- Enforce required fields.
  if v_steps is not null then
    for v_step in select * from jsonb_array_elements(v_steps) loop
      for v_field in select * from jsonb_array_elements(coalesce(v_step->'fields','[]'::jsonb)) loop
        if coalesce((v_field->>'required')::boolean, false) then
          v_key := v_field->>'key';
          if coalesce(p_answers->>v_key, '') = '' then
            raise exception 'submit_onboarding: required field "%" is missing', v_key;
          end if;
        end if;
      end loop;
    end loop;
  end if;

  insert into public.onboarding_responses(user_id, tenant_id, answers)
    values (v_user, v_ctx.tenant_id, coalesce(p_answers, '{}'::jsonb))
    on conflict (user_id) do update set answers = excluded.answers, completed_at = now();
  update public.users set onboarded_at = now() where id = v_user;

  perform app.write_audit('onboarding.completed', v_user, null, v_ctx.tenant_id, v_ctx.org_id,
    v_ctx.department_id, 'user', v_user::text, null, jsonb_build_object('fields', p_answers), null, '/onboarding');
end; $$;

revoke all on function public.set_onboarding_flow(uuid, jsonb) from public;
revoke all on function public.submit_onboarding(jsonb) from public;
grant execute on function public.set_onboarding_flow(uuid, jsonb) to authenticated, service_role;
grant execute on function public.submit_onboarding(jsonb) to authenticated, service_role;
