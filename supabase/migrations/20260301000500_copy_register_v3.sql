-- ============================================================================
-- Copy Register v3 — the full module per COPY_REGISTER_MODULE_BUILD_PLAN.md.
--
-- One door out: documents leave the system as copies ONLY through this
-- register, and only QA issues. Anyone requests (from their side of the app);
-- QA reviews → issues or declines. Every issued copy is one of three types,
-- and the TYPE decides its reconciliation behavior (§3):
--
--   controlled   — working copy, kept current  → BLOCKS revision until
--                                                 returned/destroyed
--   display      — posted at a location        → BLOCKS (the most visible
--                                                 copy is the most dangerous)
--   uncontrolled — information only, valid on   → never blocks; the register
--                  its print date                 still records that it exists
--
-- States like superseded_unreconciled / stale_uncontrolled are DERIVED from
-- the version's status + the copy's type (never stored) — the register can't
-- drift out of sync with the document lifecycle.
--
-- v2 (accountability, unique numbering, recall view, gate worklist) carries
-- forward; this adds the request flow, the type vocabulary, and re-teaches
-- the two seam-C gates (change reconciliation + retirement pre-check) to
-- count only the blocking types.
-- ============================================================================

-- ---- The type/format vocabulary on the register ----
alter table public.controlled_copies add column if not exists copy_type text not null default 'controlled'
  check (copy_type in ('controlled','display','uncontrolled'));
alter table public.controlled_copies add column if not exists format text not null default 'paper'
  check (format in ('paper','pdf'));
alter table public.controlled_copies add column if not exists request_id uuid;
alter table public.controlled_copies add column if not exists pdf_ref text;  -- rendition pointer (fills in with the rendition pipeline)

-- ---- Copy requests (C-REQUEST: anyone asks; QA decides) ----
create table if not exists public.copy_requests (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id),
  org_id         uuid,
  document_id    uuid not null references public.documents(id),
  requester_id   uuid not null,
  department_id  uuid,
  purpose        text not null,
  copy_type      text not null check (copy_type in ('controlled','display','uncontrolled')),
  format         text not null check (format in ('paper','pdf')),
  destination    text not null,
  quantity       int  not null default 1 check (quantity between 1 and 50),
  state          text not null default 'requested' check (state in ('requested','declined','fulfilled')),
  decided_by     uuid,
  decided_at     timestamptz,
  decline_reason text,
  created_at     timestamptz not null default now()
);
create index if not exists copy_requests_state_idx on public.copy_requests (tenant_id, state);
alter table public.copy_requests enable row level security;
alter table public.copy_requests force row level security;
drop policy if exists copy_requests_read on public.copy_requests;
create policy copy_requests_read on public.copy_requests for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.copy_requests to authenticated;

-- ---- Module config (presentation knobs; enforcement is never configurable) ----
-- config: {"formats":["paper","pdf"], "allow_uncontrolled":true,
--          "stamps":{"controlled":"...","display":"...","uncontrolled":"..."}}
create or replace function app.copies_config(p_tenant uuid) returns jsonb
language sql stable security definer set search_path = app, public as $$
  select coalesce((select config from public.tenant_modules
                   where tenant_id = p_tenant and module_key = 'controlled_copies'), '{}'::jsonb);
$$;
grant execute on function app.copies_config(uuid) to authenticated, service_role;

create or replace function app.copies_format_allowed(p_tenant uuid, p_format text) returns boolean
language sql stable security definer set search_path = app, public as $$
  select case
    when app.copies_config(p_tenant) ? 'formats'
      then app.copies_config(p_tenant)->'formats' ? p_format
    else true end;
$$;

-- ---- Internal mint: one place allocates numbers and writes the register ----
create or replace function app.mint_copy(
  p_version uuid, p_holder text, p_purpose text, p_type text, p_format text,
  p_request uuid, p_actor uuid)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v public.document_versions; v_num int; v_id uuid; begin
  -- The version row lock serializes copy-number allocation (v2 invariant).
  select * into v from public.document_versions where id = p_version for update;
  select coalesce(max(copy_number),0)+1 into v_num from public.controlled_copies where document_version_id = p_version;
  insert into public.controlled_copies(tenant_id, document_version_id, copy_number, holder,
      issued_by, purpose, copy_type, format, request_id)
    values (v.tenant_id, p_version, v_num, p_holder, p_actor, p_purpose, p_type, p_format, p_request)
    returning id into v_id;
  perform app.write_audit('copy.issued', p_actor, null, v.tenant_id, v.org_id, v.department_id,
    'controlled_copy', v_id::text, null,
    jsonb_build_object('copy_number', v_num, 'holder', p_holder, 'type', p_type,
                       'format', p_format, 'request', p_request, 'purpose', p_purpose),
    null, 'D-COPIES');
  return v_id;
end; $$;

-- ---- Request a copy (any org member; the ONLY way to ask for one) ----
create or replace function public.request_copy(
  p_document uuid, p_type text, p_format text, p_destination text, p_quantity int, p_purpose text)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v_caller uuid := auth.uid(); v_ctx record; v_id uuid; begin
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'request_copy: no org context'; end if;
  select * into d from public.documents where id = p_document;
  if d.id is null or d.tenant_id is distinct from v_ctx.tenant_id then
    raise exception 'request_copy: no such document'; end if;
  if not app.module_enabled(d.tenant_id, 'controlled_copies') then
    raise exception 'request_copy: the copy register module is off'; end if;
  if d.status <> 'active' then
    raise exception 'request_copy: only an active (effective) document can be copied'; end if;
  if p_type not in ('controlled','display','uncontrolled') then
    raise exception 'request_copy: type must be controlled, display or uncontrolled'; end if;
  if p_type = 'uncontrolled'
     and coalesce((app.copies_config(d.tenant_id)->>'allow_uncontrolled')::boolean, true) = false then
    raise exception 'request_copy: uncontrolled copies are not permitted for this organization'; end if;
  if p_format not in ('paper','pdf') then
    raise exception 'request_copy: format must be paper or pdf'; end if;
  if not app.copies_format_allowed(d.tenant_id, p_format) then
    raise exception 'request_copy: % copies are not permitted for this organization', p_format; end if;
  if length(trim(coalesce(p_destination,''))) = 0 then
    raise exception 'request_copy: a destination/holder is required'; end if;
  if length(trim(coalesce(p_purpose,''))) = 0 then
    raise exception 'request_copy: a purpose is required'; end if;
  if coalesce(p_quantity, 0) not between 1 and 50 then
    raise exception 'request_copy: quantity must be between 1 and 50'; end if;

  insert into public.copy_requests(tenant_id, org_id, document_id, requester_id, department_id,
      purpose, copy_type, format, destination, quantity)
    values (d.tenant_id, v_ctx.org_id, p_document, v_caller, v_ctx.department_id,
      trim(p_purpose), p_type, p_format, trim(p_destination), p_quantity)
    returning id into v_id;
  perform app.write_audit('copy.requested', v_caller, null, d.tenant_id, v_ctx.org_id, v_ctx.department_id,
    'copy_request', v_id::text, null,
    jsonb_build_object('document', p_document, 'type', p_type, 'format', p_format,
                       'destination', trim(p_destination), 'quantity', p_quantity),
    trim(p_purpose), 'D-COPIES');
  return v_id;
end; $$;

-- ---- QA declines (reason mandatory, audited) ----
create or replace function public.decline_copy_request(p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare rq public.copy_requests; v_caller uuid := auth.uid(); begin
  select * into rq from public.copy_requests where id = p_request for update;
  if rq.id is null or rq.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'decline_copy_request: no such request'; end if;
  if not app.is_qa(v_caller) then raise exception 'decline_copy_request: QA only'; end if;
  if rq.state <> 'requested' then raise exception 'decline_copy_request: already decided'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 then
    raise exception 'decline_copy_request: a reason is required'; end if;
  update public.copy_requests
    set state='declined', decided_by=v_caller, decided_at=now(), decline_reason=trim(p_reason)
    where id = p_request;
  perform app.write_audit('copy.request_declined', v_caller, null, rq.tenant_id, rq.org_id, rq.department_id,
    'copy_request', p_request::text, jsonb_build_object('state','requested'),
    jsonb_build_object('state','declined'), trim(p_reason), 'D-COPIES');
end; $$;

-- ---- QA issues a request: mints `quantity` copies of the CURRENT EFFECTIVE
--      version (issue-time, not request-time — the register never re-releases
--      an old revision) ----
create or replace function public.issue_copy_request(p_request uuid)
returns uuid[] language plpgsql security definer set search_path = app, public as $$
declare rq public.copy_requests; d public.documents; v public.document_versions;
        v_caller uuid := auth.uid(); v_ids uuid[] := '{}'; i int; begin
  select * into rq from public.copy_requests where id = p_request for update;
  if rq.id is null or rq.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'issue_copy_request: no such request'; end if;
  if not app.is_qa(v_caller) then raise exception 'issue_copy_request: QA only'; end if;
  if rq.state <> 'requested' then raise exception 'issue_copy_request: already decided'; end if;
  if not app.module_enabled(rq.tenant_id, 'controlled_copies') then
    raise exception 'issue_copy_request: the copy register module is off'; end if;
  select * into d from public.documents where id = rq.document_id;
  if d.status <> 'active' or d.current_version_id is null then
    raise exception 'issue_copy_request: the document has no effective version to copy'; end if;
  select * into v from public.document_versions where id = d.current_version_id;
  if v.status <> 'effective' then
    raise exception 'issue_copy_request: only the EFFECTIVE version may be distributed (is %)', v.status; end if;

  for i in 1..rq.quantity loop
    v_ids := array_append(v_ids,
      app.mint_copy(v.id, rq.destination, rq.purpose, rq.copy_type, rq.format, rq.id, v_caller));
  end loop;
  update public.copy_requests set state='fulfilled', decided_by=v_caller, decided_at=now()
    where id = p_request;
  perform app.write_audit('copy.request_issued', v_caller, null, rq.tenant_id, rq.org_id, rq.department_id,
    'copy_request', p_request::text, jsonb_build_object('state','requested'),
    jsonb_build_object('state','fulfilled', 'copies', to_jsonb(v_ids), 'version', v.id),
    null, 'D-COPIES');
  return v_ids;
end; $$;

-- ---- QA direct issue (request + issue in one act) gains type/format ----
drop function if exists public.issue_controlled_copy(uuid, text, text);
create or replace function public.issue_controlled_copy(
  p_version uuid, p_holder text, p_purpose text default null,
  p_type text default 'controlled', p_format text default 'paper')
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v public.document_versions; v_caller uuid := auth.uid(); begin
  select * into v from public.document_versions where id = p_version;
  if v.id is null then raise exception 'issue_controlled_copy: no such version'; end if;
  if not app.is_qa(v_caller) then raise exception 'issue_controlled_copy: QA only'; end if;
  if not app.module_enabled(v.tenant_id, 'controlled_copies') then
    raise exception 'issue_controlled_copy: the controlled-copy register module is off'; end if;
  if v.status <> 'effective' then
    raise exception 'issue_controlled_copy: only the EFFECTIVE version may be distributed (is %)', v.status; end if;
  if length(trim(coalesce(p_holder,''))) = 0 then
    raise exception 'issue_controlled_copy: a holder is required'; end if;
  if p_type not in ('controlled','display','uncontrolled') then
    raise exception 'issue_controlled_copy: type must be controlled, display or uncontrolled'; end if;
  if p_type = 'uncontrolled'
     and coalesce((app.copies_config(v.tenant_id)->>'allow_uncontrolled')::boolean, true) = false then
    raise exception 'issue_controlled_copy: uncontrolled copies are not permitted for this organization'; end if;
  if p_format not in ('paper','pdf') or not app.copies_format_allowed(v.tenant_id, p_format) then
    raise exception 'issue_controlled_copy: % copies are not permitted for this organization', p_format; end if;
  return app.mint_copy(p_version, trim(p_holder), nullif(trim(coalesce(p_purpose,'')),''),
                       p_type, p_format, null, v_caller);
end; $$;

-- ---- Seam C, type-aware: only CONTROLLED + DISPLAY copies block ----
create or replace function public.reconcile_cc(p_cc uuid, p_force_reason text default null)
returns text language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; v_outstanding int := 0; v_next text;
begin
  select * into c from public.change_controls where id=p_cc for update;
  if not app.is_qa(auth.uid()) then raise exception 'reconcile_cc: QA only'; end if;
  if c.status <> 'pending_reconciliation' then raise exception 'reconcile_cc: wrong state'; end if;

  if app.module_enabled(c.tenant_id, 'controlled_copies') then
    select count(*) into v_outstanding
      from public.change_control_documents ccd
      join public.document_versions dv on dv.document_id = ccd.document_id and dv.status='effective'
      join public.controlled_copies cp on cp.document_version_id = dv.id and cp.status='issued'
        and cp.copy_type in ('controlled','display')      -- uncontrolled never blocks (§3)
      where ccd.change_control_id = p_cc;
    if v_outstanding > 0 and p_force_reason is null then
      raise exception 'reconcile_cc: % controlled/display copies still outstanding', v_outstanding;
    end if;
    if v_outstanding > 0 then
      perform app.write_audit('reconciliation.forced', auth.uid(), null, c.tenant_id, c.org_id, c.department_id,
        'change_control', p_cc::text, null, jsonb_build_object('outstanding', v_outstanding), p_force_reason, 'D-RECONCILE');
    end if;
  end if;

  if exists (select 1 from public.change_control_documents where change_control_id=p_cc and needs_training) then
    update public.change_controls set status='pending_training' where id=p_cc; v_next := 'pending_training';
  else
    perform app.make_cc_effective(p_cc); v_next := 'effective';
  end if;
  perform app.write_audit('change.reconciled', auth.uid(), null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, null, jsonb_build_object('next', v_next), null, 'D-RECONCILE');
  return v_next;
end; $$;

create or replace function app.retirement_prechecks(p_document uuid) returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare v_effective boolean; v_no_change boolean; v_training boolean := true; v_copies boolean; v_row jsonb;
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
  select not exists(
    select 1 from public.controlled_copies cc
    join public.document_versions dv on dv.id = cc.document_version_id
    where dv.document_id = p_document and cc.status = 'issued'
      and cc.copy_type in ('controlled','display')        -- uncontrolled never blocks (§3)
  ) into v_copies;
  v_row := jsonb_build_object('has_effective', v_effective, 'no_open_change', v_no_change,
    'training_closed', v_training, 'copies_reconciled', v_copies);
  return v_row || jsonb_build_object('all_ok', v_effective and v_no_change and v_training and v_copies);
end; $$;

-- ---- The gate worklist now names every copy of the outgoing versions with
--      its type; only controlled/display are blocking (the UI splits them) ----
drop function if exists public.outstanding_copies_for_cc(uuid);
create or replace function public.outstanding_copies_for_cc(p_cc uuid)
returns table (copy_id uuid, copy_number int, holder text, purpose text, copy_type text,
               format text, blocking boolean, issued_at timestamptz, document_number text, title text)
language sql stable security invoker set search_path = public as $$
  select cp.id, cp.copy_number, cp.holder, cp.purpose, cp.copy_type, cp.format,
         cp.copy_type in ('controlled','display') as blocking,
         cp.issued_at, d.document_number, d.title
  from public.change_control_documents ccd
  join public.document_versions dv on dv.document_id = ccd.document_id and dv.status='effective'
  join public.controlled_copies cp on cp.document_version_id = dv.id and cp.status='issued'
  join public.documents d on d.id = ccd.document_id
  where ccd.change_control_id = p_cc
  order by (cp.copy_type in ('controlled','display')) desc, d.document_number, cp.copy_number;
$$;

-- ---- Views: the register with DERIVED live state, and the recall worklist ----
drop view if exists public.copies_recall_due;
create view public.copies_recall_due
with (security_invoker = true) as
  select cp.id, cp.tenant_id, cp.document_version_id, cp.copy_number, cp.holder,
         cp.purpose, cp.copy_type, cp.format, cp.issued_at, dv.status as version_status,
         d.id as document_id, d.document_number, d.title, d.status as document_status
  from public.controlled_copies cp
  join public.document_versions dv on dv.id = cp.document_version_id
  join public.documents d on d.id = dv.document_id
  where cp.status = 'issued' and cp.copy_type in ('controlled','display')
    and (dv.status <> 'effective' or d.status = 'retired');
grant select on public.copies_recall_due to authenticated;

-- The full register. live_state derives §4.1's vocabulary from the version's
-- status + the copy's type — stored state never drifts from the lifecycle.
drop view if exists public.copies_register;
create view public.copies_register
with (security_invoker = true) as
  select cp.id, cp.tenant_id, cp.document_version_id, cp.copy_number, cp.holder, cp.purpose,
         cp.copy_type, cp.format, cp.request_id, cp.issued_by, cp.issued_at,
         cp.reconciled_by, cp.reconciled_at, cp.reconciled_method, cp.reconciled_note,
         dv.status as version_status, dv.revision_number,
         d.id as document_id, d.document_number, d.title, d.status as document_status,
         case
           when cp.status = 'reconciled' then coalesce(cp.reconciled_method, 'reconciled')
           when dv.status = 'effective' and d.status <> 'retired' then 'issued'
           when cp.copy_type = 'uncontrolled' then 'stale_uncontrolled'
           else 'superseded_unreconciled'
         end as live_state
  from public.controlled_copies cp
  join public.document_versions dv on dv.id = cp.document_version_id
  join public.documents d on d.id = dv.document_id;
grant select on public.copies_register to authenticated;

do $$ declare fn text; begin
  foreach fn in array array[
    'request_copy(uuid,text,text,text,int,text)',
    'decline_copy_request(uuid,text)',
    'issue_copy_request(uuid)',
    'issue_controlled_copy(uuid,text,text,text,text)',
    'outstanding_copies_for_cc(uuid)',
    'reconcile_cc(uuid,text)']
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
