-- ============================================================================
-- Document-Control Phase 7 — Change pipe (request → change control → effective)
-- The densest workflow. Mandatory impact HARD GATE, data-driven classification
-- driving the signing matrix, concurrency/lock guard (queued), waiver (admin-only),
-- reconciliation (safe default when the copy register is off), effectiveness review
-- by an independent approver, and atomic supersession on effective. All guards are
-- server-side (Appendix B); every step audited.
-- ============================================================================

-- The change package (§10.3).
create table if not exists public.change_controls (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants(id),
  org_id             uuid not null references public.organizations(id),
  department_id      uuid references public.departments(id),
  type               text not null check (type in ('CHANGE_SINGLE','CHANGE_MULTI')),
  status             text not null default 'submitted' check (status in (
                       'submitted','clarification_requested','impact_pending','classified','queued',
                       'approved_for_document_work','documents_in_review','signatures_pending',
                       'pending_reconciliation','pending_training','effective','effectiveness_review',
                       'closed','rejected')),
  classification     text check (classification in ('minor','major','critical')),
  proposed_class     text,
  impact_assessment  jsonb,
  requester_id       uuid not null,
  intake_id          uuid references public.intake_requests(id),
  reason             text,
  effective_at       timestamptz,
  effectiveness_reviewer_id uuid,
  effectiveness_reviewed_at timestamptz,
  created_at         timestamptz not null default now(),
  closed_at          timestamptz
);
create index if not exists cc_tenant_status_idx on public.change_controls (tenant_id, status);

-- Which documents a change affects (§10.4).
create table if not exists public.change_control_documents (
  change_control_id uuid not null references public.change_controls(id),
  document_id       uuid not null references public.documents(id),
  target_version_id uuid references public.document_versions(id),
  needs_training    boolean not null default false,
  reviewed          boolean not null default false,
  released_at       timestamptz,
  primary key (change_control_id, document_id)
);

-- Signatures (§10.7). One row per required role slot; signed OR waived.
create table if not exists public.signatures (
  id                uuid primary key default gen_random_uuid(),
  change_control_id uuid not null references public.change_controls(id),
  tenant_id         uuid not null references public.tenants(id),
  role_key          text not null,
  signatory_id      uuid,
  signed_at         timestamptz,
  meaning           text,
  waived            boolean not null default false,
  waived_by         uuid,
  waiver_reason     text,
  created_at        timestamptz not null default now(),
  unique (change_control_id, role_key)
);

-- Data-driven classification matrix (§10.10): class → required signatory roles.
create table if not exists public.classification_matrix (
  tenant_id      uuid not null references public.tenants(id),
  class          text not null check (class in ('minor','major','critical')),
  required_roles text[] not null,
  primary key (tenant_id, class)
);

alter table public.change_controls          enable row level security;
alter table public.change_control_documents enable row level security;
alter table public.signatures               enable row level security;
alter table public.classification_matrix    enable row level security;
alter table public.change_controls          force row level security;
alter table public.change_control_documents force row level security;
alter table public.signatures               force row level security;
alter table public.classification_matrix    force row level security;

drop trigger if exists freeze_tenant_id on public.change_controls;
create trigger freeze_tenant_id before update on public.change_controls
  for each row execute function app.freeze_tenant_id();

-- In-flight changes: visible to the requester and QA (in-flight scope A.4).
drop policy if exists cc_read on public.change_controls;
create policy cc_read on public.change_controls for select to authenticated
  using (tenant_id = public.current_tenant_id() and (requester_id = auth.uid() or app.is_qa(auth.uid())));
drop policy if exists ccd_read on public.change_control_documents;
create policy ccd_read on public.change_control_documents for select to authenticated
  using (exists (select 1 from public.change_controls c where c.id = change_control_id
                 and c.tenant_id = public.current_tenant_id()
                 and (c.requester_id = auth.uid() or app.is_qa(auth.uid()))));
drop policy if exists signatures_read on public.signatures;
create policy signatures_read on public.signatures for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists matrix_read on public.classification_matrix;
create policy matrix_read on public.classification_matrix for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.change_controls, public.change_control_documents, public.signatures,
  public.classification_matrix to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers: impact completeness (hard gate), class proposal, required signatories.
-- ---------------------------------------------------------------------------
create or replace function app.impact_complete(p_impact jsonb) returns boolean
language sql immutable as $$
  select p_impact is not null
     and p_impact ? 'documents_affected' and p_impact ? 'training_required'
     and p_impact ? 'templates_affected' and p_impact ? 'systems_touched'
     and p_impact ? 'revalidation_needed' and p_impact ? 'regulatory_notification';
$$;

create or replace function app.propose_class(p_impact jsonb) returns text
language sql immutable as $$
  select case
    when coalesce((p_impact->>'revalidation_needed')::boolean,false)
      or coalesce((p_impact->>'regulatory_notification')::boolean,false) then 'critical'
    when coalesce((p_impact->>'training_required')::boolean,false)
      or coalesce(nullif(p_impact->>'systems_touched','')::text is not null and p_impact->>'systems_touched' <> 'none', false) then 'major'
    else 'minor' end;
$$;

-- Required signatory roles for a class — matrix data, with safe GxP defaults (§14).
create or replace function app.required_signatories(p_tenant uuid, p_class text) returns text[]
language sql stable security definer set search_path = app, public as $$
  select coalesce(
    (select required_roles from public.classification_matrix where tenant_id=p_tenant and class=p_class),
    case p_class when 'minor' then array['qa']
                 when 'major' then array['qa','hod']
                 else array['qa','hod','signatory'] end);
$$;

-- QA edits the matrix (D-CLASSIFY). Audited.
create or replace function public.set_classification_matrix(p_class text, p_roles text[])
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_ctx record;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if not app.is_qa(v_caller) then raise exception 'set_classification_matrix: QA only'; end if;
  insert into public.classification_matrix(tenant_id, class, required_roles)
    values (v_ctx.tenant_id, p_class, p_roles)
    on conflict (tenant_id, class) do update set required_roles = excluded.required_roles;
  perform app.write_audit('classification.matrix_set', v_caller, null, v_ctx.tenant_id, v_ctx.org_id, null,
    'classification_matrix', p_class, null, jsonb_build_object('roles', to_jsonb(p_roles)), null, 'D-CLASSIFY');
end; $$;

-- ---------------------------------------------------------------------------
-- create_change — open a change against effective target document(s). From a
-- dispatched intake or directly. requester = caller.
-- ---------------------------------------------------------------------------
create or replace function public.create_change(p_targets uuid[], p_reason text, p_intake uuid default null)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_cc uuid; v_type text; d uuid;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'create_change: not an org user'; end if;
  if coalesce(array_length(p_targets,1),0) = 0 then raise exception 'create_change: at least one target required'; end if;
  -- every target must have an effective version (it is a change, not a new doc)
  if (select count(*) from public.document_versions where document_id = any(p_targets) and status='effective')
     <> array_length(p_targets,1) then
    raise exception 'create_change: every target must have an effective version';
  end if;
  v_type := case when array_length(p_targets,1) = 1 then 'CHANGE_SINGLE' else 'CHANGE_MULTI' end;

  insert into public.change_controls(tenant_id, org_id, department_id, type, status, requester_id, intake_id, reason)
    values (v_ctx.tenant_id, v_ctx.org_id, v_ctx.department_id, v_type, 'submitted', v_caller, p_intake, p_reason)
    returning id into v_cc;
  foreach d in array p_targets loop
    insert into public.change_control_documents(change_control_id, document_id) values (v_cc, d);
  end loop;
  if p_intake is not null then update public.intake_requests set created_document_id = null where id = p_intake; end if;

  perform app.write_audit('change.created', v_caller, null, v_ctx.tenant_id, v_ctx.org_id, v_ctx.department_id,
    'change_control', v_cc::text, null, jsonb_build_object('type', v_type, 'targets', p_targets), p_reason, 'D-INTAKE');
  return v_cc;
end; $$;

-- QA screening loop.
create or replace function public.request_cc_clarification(p_cc uuid, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; begin
  select * into c from public.change_controls where id=p_cc for update;
  if not app.is_qa(auth.uid()) then raise exception 'QA only'; end if;
  update public.change_controls set status='clarification_requested' where id=p_cc;
  perform app.write_audit('change.clarification_requested', auth.uid(), null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, null, null, p_reason, 'D-CHANGE-SCREEN');
end; $$;

create or replace function public.reject_cc(p_cc uuid, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; begin
  select * into c from public.change_controls where id=p_cc for update;
  if not app.is_qa(auth.uid()) then raise exception 'QA only'; end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'reject_cc: reason required'; end if;
  update public.change_controls set status='rejected', closed_at=now() where id=p_cc;
  perform app.write_audit('change.rejected', auth.uid(), null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, null, null, p_reason, 'D-CHANGE-SCREEN');
end; $$;

create or replace function public.begin_screening(p_cc uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; begin
  select * into c from public.change_controls where id=p_cc for update;
  if not app.is_qa(auth.uid()) then raise exception 'QA only'; end if;
  if c.status not in ('submitted','clarification_requested') then raise exception 'begin_screening: wrong state'; end if;
  update public.change_controls set status='impact_pending' where id=p_cc;
  perform app.write_audit('change.screening', auth.uid(), null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, null, jsonb_build_object('status','impact_pending'), null, 'D-CHANGE-SCREEN');
end; $$;

-- Fill the impact assessment (does not advance — the gate is at classify).
create or replace function public.submit_impact(p_cc uuid, p_impact jsonb)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; begin
  select * into c from public.change_controls where id=p_cc for update;
  if c.requester_id <> auth.uid() and not app.is_qa(auth.uid()) then raise exception 'submit_impact: requester/QA only'; end if;
  update public.change_controls set impact_assessment=p_impact, proposed_class=app.propose_class(p_impact) where id=p_cc;
  perform app.write_audit('change.impact_updated', auth.uid(), null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, null, p_impact, null, 'D-IMPACT');
end; $$;

-- HARD GATE: classification requires a COMPLETE impact assessment. No submit-anyway.
create or replace function public.classify_cc(p_cc uuid, p_class text, p_reason text default null)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; begin
  select * into c from public.change_controls where id=p_cc for update;
  if not app.is_qa(auth.uid()) then raise exception 'classify_cc: QA only'; end if;
  if c.status <> 'impact_pending' then raise exception 'classify_cc: not in impact_pending'; end if;
  if not app.impact_complete(c.impact_assessment) then
    raise exception 'classify_cc: impact assessment is incomplete — cannot classify (hard gate)';
  end if;
  if p_class <> coalesce(c.proposed_class, p_class) and (p_reason is null or length(trim(p_reason))=0) then
    raise exception 'classify_cc: overriding the proposed class requires a reason';
  end if;
  update public.change_controls set status='classified', classification=p_class where id=p_cc;
  update public.change_control_documents
    set needs_training = coalesce((c.impact_assessment->>'training_required')::boolean,false)
    where change_control_id=p_cc;
  perform app.write_audit('change.classified', auth.uid(), null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, jsonb_build_object('proposed', c.proposed_class),
    jsonb_build_object('class', p_class), p_reason, 'D-CHANGE-SCREEN');
end; $$;

-- Concurrency guard + lock. If any target is locked under another OPEN change → queued.
-- Else lock each target, create its target draft revision (revision allocated later at
-- effective time per §7.10), and advance to document work.
create or replace function public.approve_for_work(p_cc uuid)
returns text language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; d record; v_conflict boolean := false; v_ver uuid;
begin
  select * into c from public.change_controls where id=p_cc for update;
  if not app.is_qa(auth.uid()) then raise exception 'approve_for_work: QA only'; end if;
  if c.status not in ('classified','queued') then raise exception 'approve_for_work: wrong state'; end if;

  for d in select document_id from public.change_control_documents where change_control_id=p_cc loop
    if exists (
      select 1 from public.change_control_documents x
      join public.change_controls cc2 on cc2.id = x.change_control_id
      where x.document_id = d.document_id and x.change_control_id <> p_cc
        and cc2.status in ('approved_for_document_work','documents_in_review','signatures_pending',
                           'pending_reconciliation','pending_training')
    ) then v_conflict := true; end if;
  end loop;

  if v_conflict then
    update public.change_controls set status='queued' where id=p_cc;
    perform app.write_audit('change.queued', auth.uid(), null, c.tenant_id, c.org_id, c.department_id,
      'change_control', p_cc::text, null, jsonb_build_object('reason','affected document locked under another change'), null, 'D-CHANGE-WORK');
    return 'queued';
  end if;

  for d in select document_id from public.change_control_documents where change_control_id=p_cc loop
    update public.documents set status='locked_in_cc', updated_at=now() where id=d.document_id;
    v_ver := app.add_revision(d.document_id, c.requester_id, null, c.reason, 'D-CHANGE-WORK');
    update public.change_control_documents set target_version_id=v_ver where change_control_id=p_cc and document_id=d.document_id;
  end loop;
  update public.change_controls set status='approved_for_document_work' where id=p_cc;
  perform app.write_audit('change.approved_for_work', auth.uid(), null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, null, jsonb_build_object('status','approved_for_document_work'), null, 'D-CHANGE-WORK');
  return 'approved_for_document_work';
end; $$;

create or replace function public.open_document_work(p_cc uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; begin
  select * into c from public.change_controls where id=p_cc for update;
  if not app.is_qa(auth.uid()) then raise exception 'QA only'; end if;
  if c.status <> 'approved_for_document_work' then raise exception 'open_document_work: wrong state'; end if;
  update public.change_controls set status='documents_in_review' where id=p_cc;
  perform app.write_audit('change.documents_in_review', auth.uid(), null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, null, null, null, 'D-CHANGE-WORK');
end; $$;

-- QA reviews an affected document's target revision (SoD: QA ≠ requester). When all
-- are reviewed, advance to signatures and seed the required signature slots.
create or replace function public.review_cc_document(p_cc uuid, p_document uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; ccd public.change_control_documents; r text;
begin
  select * into c from public.change_controls where id=p_cc for update;
  if not app.is_qa(auth.uid()) then raise exception 'review_cc_document: QA only'; end if;
  if c.status <> 'documents_in_review' then raise exception 'review_cc_document: wrong state'; end if;
  perform app.enforce_sod(auth.uid(), c.requester_id, 'review');
  select * into ccd from public.change_control_documents where change_control_id=p_cc and document_id=p_document;
  if ccd.target_version_id is null then raise exception 'review_cc_document: no target version'; end if;
  perform app.transition_version(ccd.target_version_id,'in_approval', auth.uid(), null, 'D-CHANGE-WORK');
  perform app.transition_version(ccd.target_version_id,'approved', auth.uid(), null, 'D-CHANGE-WORK');
  update public.change_control_documents set reviewed=true where change_control_id=p_cc and document_id=p_document;

  if not exists (select 1 from public.change_control_documents where change_control_id=p_cc and not reviewed) then
    update public.change_controls set status='signatures_pending' where id=p_cc;
    foreach r in array app.required_signatories(c.tenant_id, c.classification) loop
      insert into public.signatures(change_control_id, tenant_id, role_key) values (p_cc, c.tenant_id, r)
        on conflict do nothing;
    end loop;
    perform app.write_audit('change.signatures_pending', auth.uid(), null, c.tenant_id, c.org_id, c.department_id,
      'change_control', p_cc::text, null, jsonb_build_object('required', app.required_signatories(c.tenant_id, c.classification)), null, 'D-CHANGE-WORK');
  end if;
end; $$;

-- Apply a signature for a required role the caller holds (Part 11 meaning captured).
create or replace function public.apply_signature(p_cc uuid, p_meaning text)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; v_caller uuid := auth.uid(); v_role text;
begin
  select * into c from public.change_controls where id=p_cc for update;
  if c.status <> 'signatures_pending' then raise exception 'apply_signature: not awaiting signatures'; end if;
  select role_key into v_role from public.signatures s
    where s.change_control_id=p_cc and s.signed_at is null and not s.waived
      and app.has_role(v_caller, s.role_key, c.department_id)
    limit 1;
  if v_role is null then raise exception 'apply_signature: no open signature slot for your role'; end if;
  update public.signatures set signatory_id=v_caller, signed_at=now(), meaning=p_meaning
    where change_control_id=p_cc and role_key=v_role;
  perform app.write_audit('signature.applied', v_caller, null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, null, jsonb_build_object('role', v_role, 'meaning', p_meaning), null, 'D-SIGN');
  perform app.check_cc_completion(p_cc);
end; $$;

-- Waiver: admin-only, reason-required, logged (§7.8).
create or replace function public.waive_signature(p_cc uuid, p_role text, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; v_caller uuid := auth.uid();
begin
  select * into c from public.change_controls where id=p_cc for update;
  if not app.has_role(v_caller,'org_admin') then raise exception 'waive_signature: admin only'; end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'waive_signature: reason required'; end if;
  update public.signatures set waived=true, waived_by=v_caller, waiver_reason=p_reason
    where change_control_id=p_cc and role_key=p_role;
  perform app.write_audit('signature.waived', v_caller, null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, null, jsonb_build_object('role', p_role), p_reason, 'S17-exception');
  perform app.check_cc_completion(p_cc);
end; $$;

-- Completion check: every required role signed or waived → pending_reconciliation.
create or replace function app.check_cc_completion(p_cc uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; begin
  select * into c from public.change_controls where id=p_cc for update;
  if c.status <> 'signatures_pending' then return; end if;
  if not exists (select 1 from public.signatures where change_control_id=p_cc and signed_at is null and not waived) then
    update public.change_controls set status='pending_reconciliation' where id=p_cc;
    perform app.write_audit('change.signatures_complete', null, null, c.tenant_id, c.org_id, c.department_id,
      'change_control', p_cc::text, null, jsonb_build_object('status','pending_reconciliation'), null, 'system');
  end if;
end; $$;

-- Reconciliation (§7.9). Safe default when the copy register module is off: nothing
-- to reconcile → pass. When on: every issued copy of the outgoing versions accounted.
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
      where ccd.change_control_id = p_cc;
    if v_outstanding > 0 and p_force_reason is null then
      raise exception 'reconcile_cc: % controlled copies still outstanding', v_outstanding;
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

create or replace function public.release_cc_training(p_cc uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; begin
  select * into c from public.change_controls where id=p_cc for update;
  if not (app.is_qa(auth.uid()) or app.has_role(auth.uid(),'trainer')) then raise exception 'release_cc_training: QA/trainer only'; end if;
  if c.status <> 'pending_training' then raise exception 'release_cc_training: wrong state'; end if;
  perform app.make_cc_effective(p_cc);
end; $$;

-- Atomic supersession for every affected document (§7.11), then unlock at new revision.
create or replace function app.make_cc_effective(p_cc uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; d record; begin
  select * into c from public.change_controls where id=p_cc for update;
  for d in select document_id, target_version_id from public.change_control_documents where change_control_id=p_cc loop
    perform app.make_effective(d.target_version_id, c.requester_id, now(), 'D-CHANGE-WORK');  -- atomic per doc
    update public.change_control_documents set released_at=now() where change_control_id=p_cc and document_id=d.document_id;
  end loop;
  update public.change_controls set status='effective', effective_at=now() where id=p_cc;
  perform app.write_audit('change.effective', null, null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, null, jsonb_build_object('status','effective'), null, 'system');
end; $$;

-- Effectiveness review before closure (§7.12). Independent approver (≠ requester).
create or replace function public.enter_effectiveness_review(p_cc uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; begin
  select * into c from public.change_controls where id=p_cc for update;
  if c.status <> 'effective' then raise exception 'enter_effectiveness_review: not effective'; end if;
  update public.change_controls set status='effectiveness_review' where id=p_cc;
  perform app.write_audit('change.effectiveness_review', auth.uid(), null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, null, null, null, 'D-EFFECTIVENESS');
end; $$;

create or replace function public.close_cc(p_cc uuid, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; v_caller uuid := auth.uid(); begin
  select * into c from public.change_controls where id=p_cc for update;
  if c.status <> 'effectiveness_review' then raise exception 'close_cc: not in effectiveness review'; end if;
  if not app.is_qa(v_caller) then raise exception 'close_cc: QA/approver only'; end if;
  perform app.enforce_sod(v_caller, c.requester_id, 'effectiveness_review');   -- reviewer ≠ requester
  update public.change_controls set status='closed', closed_at=now(),
    effectiveness_reviewer_id=v_caller, effectiveness_reviewed_at=now() where id=p_cc;
  perform app.write_audit('change.closed', v_caller, null, c.tenant_id, c.org_id, c.department_id,
    'change_control', p_cc::text, null, jsonb_build_object('status','closed'), p_reason, 'D-EFFECTIVENESS');
end; $$;

do $$ declare fn text; begin
  foreach fn in array array[
    'create_change(uuid[],text,uuid)','request_cc_clarification(uuid,text)','reject_cc(uuid,text)',
    'begin_screening(uuid)','submit_impact(uuid,jsonb)','classify_cc(uuid,text,text)','approve_for_work(uuid)',
    'open_document_work(uuid)','review_cc_document(uuid,uuid)','apply_signature(uuid,text)','waive_signature(uuid,text,text)',
    'reconcile_cc(uuid,text)','release_cc_training(uuid)','enter_effectiveness_review(uuid)','close_cc(uuid,text)',
    'set_classification_matrix(text,text[])']
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
