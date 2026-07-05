-- ============================================================================
-- Configurable dashboards.
--
-- Two BASE dashboards exist per tenant — Admin and Employee (audience) — and
-- QA can lay down a per-department override on top of either. Everyone in a
-- department sees that department's dashboard on their dashboard page; without
-- an override they see the base; without a base they see the code default.
--
-- The widget catalogue lives in code (like the default onboarding steps): the
-- database stores WHICH widgets, their order and size — never markup. Design
-- authority lies with QA; every change is audited old → new. The dashboard
-- always renders (safe defaults in code), so this system's absence can never
-- block the flow of the app.
-- ============================================================================

create table if not exists public.dashboard_configs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  audience      text not null check (audience in ('admin','employee')),
  department_id uuid references public.departments(id),   -- null = the base dashboard
  widgets       jsonb not null,
  updated_by    uuid,
  updated_at    timestamptz not null default now()
);

-- One config per (tenant, audience, department-or-base).
create unique index if not exists dashboard_configs_scope_idx
  on public.dashboard_configs (tenant_id, audience,
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid));

drop trigger if exists freeze_tenant_id on public.dashboard_configs;
create trigger freeze_tenant_id before update on public.dashboard_configs
  for each row execute function app.freeze_tenant_id();

alter table public.dashboard_configs enable row level security;
alter table public.dashboard_configs force row level security;

drop policy if exists dashboard_configs_read on public.dashboard_configs;
create policy dashboard_configs_read on public.dashboard_configs
  for select to authenticated using (tenant_id = public.current_tenant_id());

grant select on public.dashboard_configs to authenticated;

-- ---------------------------------------------------------------------------
-- set_dashboard_config — QA designs the dashboard for an audience, base or
-- per department. p_widgets NULL resets the scope (falls back to base/default).
-- Shape is validated here; the widget catalogue itself lives in code, so an
-- unknown key simply renders nothing rather than breaking anyone's dashboard.
-- ---------------------------------------------------------------------------
create or replace function public.set_dashboard_config(
  p_audience   text,
  p_department uuid,
  p_widgets    jsonb
) returns void
language plpgsql security definer set search_path = app, public
as $$
declare
  v_caller uuid := auth.uid();
  v_ctx    record;
  v_old    jsonb;
  v_item   jsonb;
  v_size   text;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'set_dashboard_config: caller is not an org user'; end if;
  if not app.is_qa(v_caller) then
    raise exception 'set_dashboard_config: dashboard design authority lies with QA';
  end if;
  if p_audience not in ('admin','employee') then
    raise exception 'set_dashboard_config: audience must be admin or employee';
  end if;
  if p_department is not null and not exists (
    select 1 from public.departments d where d.id = p_department and d.tenant_id = v_ctx.tenant_id
  ) then
    raise exception 'set_dashboard_config: unknown department';
  end if;

  select widgets into v_old from public.dashboard_configs
   where tenant_id = v_ctx.tenant_id and audience = p_audience
     and department_id is not distinct from p_department;

  if p_widgets is null then
    -- Reset: the scope falls back to its base (or the code default).
    delete from public.dashboard_configs
     where tenant_id = v_ctx.tenant_id and audience = p_audience
       and department_id is not distinct from p_department;
    perform app.write_audit('dashboard.config_reset', v_caller, null,
      v_ctx.tenant_id, v_ctx.org_id, p_department, 'dashboard_config', p_audience,
      v_old, null, null, 'S-DASHBOARD-DESIGN');
    return;
  end if;

  if jsonb_typeof(p_widgets) <> 'array' then
    raise exception 'set_dashboard_config: widgets must be an array';
  end if;
  if jsonb_array_length(p_widgets) < 1 or jsonb_array_length(p_widgets) > 24 then
    raise exception 'set_dashboard_config: between 1 and 24 widgets';
  end if;
  for v_item in select * from jsonb_array_elements(p_widgets) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(jsonb_typeof(v_item->'key'), 'missing') <> 'string'
       or length(v_item->>'key') = 0 or length(v_item->>'key') > 64 then
      raise exception 'set_dashboard_config: each widget needs a "key" string';
    end if;
    v_size := v_item->>'size';
    if v_size is not null and v_size not in ('full','half') then
      raise exception 'set_dashboard_config: widget size must be full or half';
    end if;
  end loop;

  insert into public.dashboard_configs(tenant_id, audience, department_id, widgets, updated_by, updated_at)
  values (v_ctx.tenant_id, p_audience, p_department, p_widgets, v_caller, now())
  on conflict (tenant_id, audience, coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set widgets = excluded.widgets, updated_by = excluded.updated_by, updated_at = now();

  perform app.write_audit('dashboard.config_set', v_caller, null,
    v_ctx.tenant_id, v_ctx.org_id, p_department, 'dashboard_config', p_audience,
    v_old, p_widgets, null, 'S-DASHBOARD-DESIGN');
end;
$$;

revoke all on function public.set_dashboard_config(text, uuid, jsonb) from public;
grant execute on function public.set_dashboard_config(text, uuid, jsonb) to authenticated, service_role;
