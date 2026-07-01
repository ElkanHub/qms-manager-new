-- ============================================================================
-- Document-Control Phase 8 — Retirement pipe (discontinuation → destruction)
-- request → QA approval (pre-checks) → withdraw (retention hold) → time-gated,
-- logged destruction that preserves metadata + audit. Supersession (Phase 7) and
-- retirement both land versions in `retained` and share the destruction tail (§8.6).
-- The retention time-gate is non-negotiable; only the period VALUE is configurable.
-- ============================================================================

create table if not exists public.retirements (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id),
  org_id                 uuid not null references public.organizations(id),
  department_id          uuid references public.departments(id),
  document_id            uuid not null references public.documents(id),
  status                 text not null default 'retirement_requested'
                         check (status in ('retirement_requested','retirement_approved','pending_destruction','destroyed')),
  justification          text not null,
  requester_id           uuid not null,
  approver_id            uuid,
  precheck_results       jsonb,
  destroyed_at           timestamptz,
  destruction_method     text,
  destruction_approver_id uuid,
  created_at             timestamptz not null default now()
);
create index if not exists retirements_tenant_idx on public.retirements (tenant_id, status);

-- Per-tenant retention period (the VALUE is configurable; the gate is not). Default 60 months.
create table if not exists public.retention_settings (
  tenant_id uuid primary key references public.tenants(id),
  months    int not null default 60,
  updated_by uuid, updated_at timestamptz not null default now()
);

drop trigger if exists freeze_tenant_id on public.retirements;
create trigger freeze_tenant_id before update on public.retirements
  for each row execute function app.freeze_tenant_id();

alter table public.retirements        enable row level security;
alter table public.retention_settings enable row level security;
alter table public.retirements        force row level security;
alter table public.retention_settings force row level security;
drop policy if exists retirements_read on public.retirements;
create policy retirements_read on public.retirements for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists retention_settings_read on public.retention_settings;
create policy retention_settings_read on public.retention_settings for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.retirements, public.retention_settings to authenticated;

create or replace function app.retention_months(p_tenant uuid) returns int
language sql stable security definer set search_path = app, public as $$
  select coalesce((select months from public.retention_settings where tenant_id=p_tenant), 60);
$$;

-- QA sets the retention period value.
create or replace function public.set_retention_period(p_months int)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_ctx record; begin
  select * into v_ctx from app.actor_context(auth.uid());
  if not app.is_qa(auth.uid()) then raise exception 'set_retention_period: QA only'; end if;
  insert into public.retention_settings(tenant_id, months, updated_by, updated_at)
    values (v_ctx.tenant_id, p_months, auth.uid(), now())
    on conflict (tenant_id) do update set months=excluded.months, updated_by=auth.uid(), updated_at=now();
  perform app.write_audit('retention.period_set', auth.uid(), null, v_ctx.tenant_id, v_ctx.org_id, null,
    'retention_settings', v_ctx.tenant_id::text, null, jsonb_build_object('months', p_months), null, 'config');
end; $$;

-- Move a version into the retention hold (sets the clock). Both paths use this:
-- retirement (effective→retained) and supersession (superseded→retained).
create or replace function app.begin_retention(p_version uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = app, public as $$
declare v public.document_versions; begin
  select * into v from public.document_versions where id=p_version for update;
  if v.status not in ('superseded','effective') then raise exception 'begin_retention: version not superseded/effective'; end if;
  update public.document_versions
    set status='retained', retention_until = now() + make_interval(months => app.retention_months(v.tenant_id))
    where id=p_version;
  perform app.write_audit('version.retained', p_actor, null, v.tenant_id, v.org_id, v.department_id,
    'document_version', p_version::text, jsonb_build_object('status', v.status),
    jsonb_build_object('status','retained'), null, 'retention');
end; $$;

-- Batch: move superseded versions into the retention hold (the other path into `retained`).
create or replace function public.start_retention_holds()
returns int language plpgsql security definer set search_path = app, public as $$
declare v record; n int := 0; begin
  for v in select id from public.document_versions where status='superseded' and retention_until is null loop
    perform app.begin_retention(v.id, null); n := n + 1;
  end loop; return n;
end; $$;

-- ---------------------------------------------------------------------------
-- Pre-checks (§8.4): must pass before QA can approve. What we can verify now:
-- an effective version exists; no OPEN change control targets it; training closed
-- (if the training module's assignments exist). Filing check is a placeholder true.
-- ---------------------------------------------------------------------------
create or replace function app.retirement_prechecks(p_document uuid) returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare v_effective boolean; v_no_change boolean; v_training boolean := true; v_row jsonb;
begin
  select exists(select 1 from public.document_versions where document_id=p_document and status='effective') into v_effective;
  select not exists(
    select 1 from public.change_control_documents ccd
    join public.change_controls c on c.id=ccd.change_control_id
    where ccd.document_id=p_document and c.status not in ('closed','rejected')
  ) into v_no_change;
  if to_regclass('public.training_assignments') is not null then
    execute 'select not exists(select 1 from public.training_assignments where document_id=$1 and status<>''completed'')'
      into v_training using p_document;
  end if;
  v_row := jsonb_build_object('has_effective', v_effective, 'no_open_change', v_no_change,
    'training_closed', v_training, 'filing_clear', true);
  return v_row || jsonb_build_object('all_ok', v_effective and v_no_change and v_training);
end; $$;

-- ---------------------------------------------------------------------------
-- Retirement transitions.
-- ---------------------------------------------------------------------------
create or replace function public.request_retirement(p_document uuid, p_justification text)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v_id uuid; begin
  select * into d from public.documents where id=p_document;
  if d.id is null then raise exception 'request_retirement: no such document'; end if;
  if d.status <> 'active' then raise exception 'request_retirement: only an active document can be retired'; end if;
  if p_justification is null or length(trim(p_justification))=0 then raise exception 'request_retirement: justification required'; end if;
  insert into public.retirements(tenant_id, org_id, department_id, document_id, justification, requester_id)
    values (d.tenant_id, d.org_id, d.department_id, p_document, p_justification, auth.uid()) returning id into v_id;
  perform app.write_audit('retirement.requested', auth.uid(), null, d.tenant_id, d.org_id, d.department_id,
    'retirement', v_id::text, null, jsonb_build_object('document', p_document), p_justification, 'D-RETIRE-REQUEST');
  return v_id;
end; $$;

-- QA approves — pre-checks must pass; QA ≠ requester.
create or replace function public.approve_retirement(p_retirement uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare r public.retirements; v_checks jsonb; v_caller uuid := auth.uid(); begin
  select * into r from public.retirements where id=p_retirement for update;
  if r.id is null or r.status<>'retirement_requested' then raise exception 'approve_retirement: not pending'; end if;
  if not app.is_qa(v_caller) then raise exception 'approve_retirement: QA only'; end if;
  perform app.enforce_sod(v_caller, r.requester_id, 'approve_retirement');
  v_checks := app.retirement_prechecks(r.document_id);
  if not (v_checks->>'all_ok')::boolean then
    raise exception 'approve_retirement: pre-checks failed: %', v_checks;
  end if;
  update public.retirements set status='retirement_approved', approver_id=v_caller, precheck_results=v_checks where id=p_retirement;
  perform app.write_audit('retirement.approved', v_caller, null, r.tenant_id, r.org_id, r.department_id,
    'retirement', p_retirement::text, jsonb_build_object('status','retirement_requested'),
    jsonb_build_object('status','retirement_approved'), null, 'D-RETIRE-REVIEW');
end; $$;

-- Withdraw from use → document retired, effective version enters the retention hold.
create or replace function public.withdraw_retirement(p_retirement uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare r public.retirements; v_ver uuid; begin
  select * into r from public.retirements where id=p_retirement for update;
  if r.id is null or r.status<>'retirement_approved' then raise exception 'withdraw_retirement: not approved'; end if;
  if not app.is_qa(auth.uid()) then raise exception 'withdraw_retirement: QA only'; end if;
  select id into v_ver from public.document_versions where document_id=r.document_id and status='effective';
  update public.documents set status='retired', current_version_id=null, updated_at=now() where id=r.document_id;
  if v_ver is not null then perform app.begin_retention(v_ver, auth.uid()); end if;
  update public.retirements set status='pending_destruction' where id=p_retirement;
  perform app.write_audit('retirement.withdrawn', auth.uid(), null, r.tenant_id, r.org_id, r.department_id,
    'retirement', p_retirement::text, jsonb_build_object('status','retirement_approved'),
    jsonb_build_object('status','pending_destruction'), null, 'D-RETIRE-REVIEW');
end; $$;

-- ---------------------------------------------------------------------------
-- Destruction (§8.5) — the time-gate. A retained version may only be destroyed
-- after retention_until elapses, regardless of role. Content is removed; metadata
-- and audit are retained. Serves both retirement- and supersession-retained versions.
-- ---------------------------------------------------------------------------
create or replace function public.destroy_version(p_version uuid, p_method text, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare v public.document_versions; v_caller uuid := auth.uid(); begin
  select * into v from public.document_versions where id=p_version for update;
  if v.id is null then raise exception 'destroy_version: no such version'; end if;
  if not (app.is_qa(v_caller) or app.has_role(v_caller,'org_admin')) then raise exception 'destroy_version: QA/Admin only'; end if;
  if v.status <> 'retained' then raise exception 'destroy_version: version is not in retention'; end if;
  if v.retention_until is null or v.retention_until > now() then
    raise exception 'destroy_version: retention period has not elapsed (time-gate)';
  end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'destroy_version: reason required'; end if;

  -- remove content; keep the row, metadata and audit (never a true delete)
  update public.document_versions set status='destroyed', content_ref=null, rendition_ref=null where id=p_version;
  update public.retirements
    set status='destroyed', destroyed_at=now(), destruction_method=p_method, destruction_approver_id=v_caller
    where document_id=v.document_id and status='pending_destruction';
  perform app.write_audit('version.destroyed', v_caller, null, v.tenant_id, v.org_id, v.department_id,
    'document_version', p_version::text, jsonb_build_object('status','retained'),
    jsonb_build_object('status','destroyed','method', p_method), p_reason, 'D-DESTRUCTION');
end; $$;

-- Wire the intake RETIRE path (NEW_SOP/CHANGE were wired earlier).
create or replace function public.dispatch_intake(p_intake uuid, p_resume_document_id uuid default null)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare i public.intake_requests; v_type text; v_doc uuid; v_cc uuid; v_ret uuid; begin
  select * into i from public.intake_requests where id = p_intake for update;
  if i.id is null then raise exception 'dispatch_intake: no such intake'; end if;
  if i.status = 'dispatched' then raise exception 'dispatch_intake: type already locked at dispatch'; end if;
  if i.requester_id <> auth.uid() and not app.is_qa(auth.uid()) then raise exception 'dispatch_intake: requester or QA only'; end if;
  v_type := coalesce(i.confirmed_type, i.inferred_type);

  if v_type = 'NEW_SOP' then
    if p_resume_document_id is not null then v_doc := p_resume_document_id;
    else select document_id into v_doc from app.create_document(i.tenant_id, i.org_id, i.department_id,
      coalesce(i.title,'Untitled'), null, i.requester_id, i.requester_id, i.content_ref, i.reason, 'D-INTAKE'); end if;
  elsif v_type in ('CHANGE_SINGLE','CHANGE_MULTI') then
    v_cc := public.create_change(i.target_ids, i.reason, i.id);
  elsif v_type = 'RETIRE' then
    v_ret := public.request_retirement(i.target_ids[1], i.reason);
  end if;

  update public.intake_requests set status='dispatched', dispatched_type=v_type, dispatched_at=now(), created_document_id=v_doc where id=p_intake;
  perform app.write_audit('intake.dispatched', auth.uid(), null, i.tenant_id, i.org_id, i.department_id,
    'intake_request', p_intake::text, null,
    jsonb_build_object('type', v_type, 'document', v_doc, 'change_control', v_cc, 'retirement', v_ret), null, 'D-INTAKE');
  return coalesce(v_doc, v_cc, v_ret);
end; $$;

do $$ declare fn text; begin
  foreach fn in array array['set_retention_period(int)','start_retention_holds()','request_retirement(uuid,text)',
    'approve_retirement(uuid)','withdraw_retirement(uuid)','destroy_version(uuid,text,text)']
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
grant execute on function app.begin_retention(uuid,uuid), app.retirement_prechecks(uuid), app.retention_months(uuid) to service_role;
