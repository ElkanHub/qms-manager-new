-- ============================================================================
-- Document-Control Phase 6 — New SOP pipe (creation → active rev 00)
-- draft → HOD endorse (employees) / direct (managers) → QA review → approve →
-- {training | scheduled | active}. All SoD via the foundation primitive; HOD-is-
-- submitter fallback (skip to QA, logged); training coupling seam with safe default;
-- future effective date holds in `scheduled`; reject preserves the draft + reason.
-- ============================================================================

-- Approval cycle record (§10.5, §4.4). Stages hod_review / qa_review.
create table if not exists public.approval_requests (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id),
  org_id            uuid not null references public.organizations(id),
  department_id     uuid references public.departments(id),
  document_id       uuid not null references public.documents(id),
  version_id        uuid not null references public.document_versions(id),
  change_control_id uuid,                                     -- set when part of a CC (Phase 7)
  stage             text not null check (stage in ('hod_review','qa_review')),
  status            text not null default 'pending' check (status in ('pending','changes_requested','approved','rejected')),
  submitted_by      uuid not null,
  actor_id          uuid,
  reason            text,
  created_at        timestamptz not null default now(),
  decided_at        timestamptz
);
create index if not exists approval_requests_queue_idx on public.approval_requests (tenant_id, stage, status);
create index if not exists approval_requests_doc_idx on public.approval_requests (document_id);

-- Future effective date target (holds the version until the date arrives).
alter table public.document_versions add column if not exists scheduled_for timestamptz;

drop trigger if exists freeze_tenant_id on public.approval_requests;
create trigger freeze_tenant_id before update on public.approval_requests
  for each row execute function app.freeze_tenant_id();

alter table public.approval_requests enable row level security;
alter table public.approval_requests force row level security;
-- Visible to parties: the submitter, the document's department, and QA (in-flight scope A.4).
drop policy if exists approval_requests_read on public.approval_requests;
create policy approval_requests_read on public.approval_requests for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and (submitted_by = auth.uid() or app.is_party_to_document(document_id, auth.uid())));
grant select on public.approval_requests to authenticated;

-- Edit a draft's title/content/reason before submission (author/owner only).
create or replace function public.update_draft(
  p_document uuid, p_title text, p_content_ref text, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v public.document_versions; v_caller uuid := auth.uid();
begin
  select * into d from public.documents where id = p_document for update;
  if d.id is null then raise exception 'update_draft: no such document'; end if;
  if d.status not in ('draft','in_review') then raise exception 'update_draft: document is not editable'; end if;
  if not (d.owner_id = v_caller or app.is_qa(v_caller)) then raise exception 'update_draft: author/QA only'; end if;
  select * into v from public.document_versions where document_id=p_document and status='draft' order by created_at desc limit 1;
  if v.id is null then raise exception 'update_draft: no editable draft version'; end if;
  update public.documents set title = coalesce(p_title, title), updated_at = now() where id = p_document;
  update public.document_versions set content_ref = p_content_ref, reason_for_change = p_reason where id = v.id;
  perform app.write_audit('draft.updated', v_caller, null, d.tenant_id, d.org_id, d.department_id,
    'document', p_document::text, null, jsonb_build_object('title', p_title), null, 'D-DRAFT');
end; $$;

-- ---------------------------------------------------------------------------
-- submit_document — author submits a draft. Employees route to HOD endorsement;
-- managers (HOD of the dept, or QA) go straight to QA. If the submitter IS the
-- department HOD, the HOD-endorsement step is skipped to QA and the fallback is
-- logged (§6.4) — an author can never endorse their own document.
-- ---------------------------------------------------------------------------
create or replace function public.submit_document(p_document uuid)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v public.document_versions; v_caller uuid := auth.uid();
  v_stage text; v_manager boolean; v_req uuid;
begin
  select * into d from public.documents where id = p_document;
  if d.id is null then raise exception 'submit_document: no such document'; end if;
  select * into v from public.document_versions
    where document_id = p_document and status = 'draft' order by created_at desc limit 1;
  if v.id is null then raise exception 'submit_document: no draft version to submit'; end if;
  if v.reason_for_change is null and d.title is null then
    raise exception 'submit_document: reason/content required'; end if;

  v_manager := app.has_role(v_caller, 'hod', d.department_id) or app.is_qa(v_caller);
  v_stage := case when v_manager then 'qa_review' else 'hod_review' end;

  perform app.transition_version(v.id, 'in_approval', v_caller, null, 'D-DRAFT');
  update public.documents set status = 'in_review', updated_at = now() where id = p_document;

  insert into public.approval_requests(tenant_id, org_id, department_id, document_id, version_id, stage, submitted_by)
    values (d.tenant_id, d.org_id, d.department_id, p_document, v.id, v_stage, v_caller) returning id into v_req;

  perform app.write_audit('document.submitted', v_caller, null, d.tenant_id, d.org_id, d.department_id,
    'approval_request', v_req::text, null, jsonb_build_object('stage', v_stage), null, 'D-DRAFT');
  if v_manager and app.has_role(v_caller, 'hod', d.department_id) then
    perform app.write_audit('endorsement.fallback', v_caller, null, d.tenant_id, d.org_id, d.department_id,
      'document', p_document::text, null, jsonb_build_object('reason','HOD is the submitter; endorsement skipped to QA'),
      'HOD is the submitter', 'D-DRAFT');
  end if;
  return v_req;
end; $$;

-- HOD endorses an employee submission → creates the QA-review stage. SoD: HOD of the
-- department AND not the submitter.
create or replace function public.endorse_request(p_request uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare r public.approval_requests; v_caller uuid := auth.uid(); v_qa uuid;
begin
  select * into r from public.approval_requests where id = p_request for update;
  if r.id is null then raise exception 'endorse_request: no such request'; end if;
  if r.stage <> 'hod_review' or r.status <> 'pending' then raise exception 'endorse_request: not a pending HOD review'; end if;
  if not app.has_role(v_caller, 'hod', r.department_id) then raise exception 'endorse_request: HOD of the department only'; end if;
  perform app.enforce_sod(v_caller, r.submitted_by, 'endorse');

  update public.approval_requests set status='approved', actor_id=v_caller, decided_at=now() where id=p_request;
  insert into public.approval_requests(tenant_id, org_id, department_id, document_id, version_id, stage, submitted_by)
    values (r.tenant_id, r.org_id, r.department_id, r.document_id, r.version_id, 'qa_review', r.submitted_by)
    returning id into v_qa;
  perform app.write_audit('document.endorsed', v_caller, null, r.tenant_id, r.org_id, r.department_id,
    'approval_request', p_request::text, jsonb_build_object('status','pending'), jsonb_build_object('status','approved'),
    null, 'D-ENDORSE');
end; $$;

-- Request changes (HOD or QA) → back to the author; version returns to draft.
create or replace function public.request_changes(p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare r public.approval_requests; v_caller uuid := auth.uid();
begin
  select * into r from public.approval_requests where id = p_request for update;
  if r.id is null or r.status <> 'pending' then raise exception 'request_changes: not a pending request'; end if;
  update public.approval_requests set status='changes_requested', actor_id=v_caller, reason=p_reason, decided_at=now()
    where id=p_request;
  perform app.transition_version(r.version_id, 'draft', v_caller, p_reason, 'review');
  perform app.write_audit('document.changes_requested', v_caller, null, r.tenant_id, r.org_id, r.department_id,
    'approval_request', p_request::text, null, null, p_reason, 'review');
end; $$;

-- Author resubmits after changes → re-opens the same stage.
create or replace function public.resubmit_document(p_document uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare r public.approval_requests; v_caller uuid := auth.uid();
begin
  select * into r from public.approval_requests
    where document_id = p_document and status = 'changes_requested' order by created_at desc limit 1;
  if r.id is null then raise exception 'resubmit_document: nothing awaiting changes'; end if;
  update public.approval_requests set status='pending', actor_id=v_caller, decided_at=null where id=r.id;
  perform app.transition_version(r.version_id, 'in_approval', v_caller, null, 'D-CHANGES');
  perform app.write_audit('document.resubmitted', v_caller, null, r.tenant_id, r.org_id, r.department_id,
    'approval_request', r.id::text, null, jsonb_build_object('stage', r.stage), null, 'D-CHANGES');
end; $$;

-- Reject (QA/Admin) → document back to draft with the reason retained (never deleted, §6.7).
create or replace function public.reject_request(p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare r public.approval_requests; v_caller uuid := auth.uid();
begin
  select * into r from public.approval_requests where id = p_request for update;
  if r.id is null or r.status not in ('pending','changes_requested') then raise exception 'reject_request: not open'; end if;
  if not (app.is_qa(v_caller) or app.has_role(v_caller,'org_admin')) then raise exception 'reject_request: QA/Admin only'; end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'reject_request: reason required'; end if;
  update public.approval_requests set status='rejected', actor_id=v_caller, reason=p_reason, decided_at=now() where id=p_request;
  -- return the version to draft (row preserved) and the document to draft
  if (select status from public.document_versions where id=r.version_id) = 'in_approval' then
    perform app.transition_version(r.version_id, 'draft', v_caller, p_reason, 'D-QA-REVIEW');
  end if;
  update public.documents set status='draft', updated_at=now() where id=r.document_id;
  perform app.write_audit('document.rejected', v_caller, null, r.tenant_id, r.org_id, r.department_id,
    'approval_request', p_request::text, null, null, p_reason, 'D-QA-REVIEW');
end; $$;

-- ---------------------------------------------------------------------------
-- qa_approve — the sole release authority signs off, then the effective window is
-- resolved via the training coupling seam (safe default when the module is off).
-- SoD: QA ≠ submitter and QA ≠ author. Outcome: pending_training | scheduled | active.
-- ---------------------------------------------------------------------------
create or replace function public.qa_approve(
  p_request uuid, p_training_required boolean default false, p_effective_date date default null)
returns text language plpgsql security definer set search_path = app, public as $$
declare
  r public.approval_requests; v public.document_versions; v_caller uuid := auth.uid();
  v_flow uuid; v_ans jsonb; v_outcome text;
begin
  select * into r from public.approval_requests where id = p_request for update;
  if r.id is null or r.stage <> 'qa_review' or r.status <> 'pending' then
    raise exception 'qa_approve: not a pending QA review'; end if;
  if not app.is_qa(v_caller) then raise exception 'qa_approve: QA only'; end if;
  select * into v from public.document_versions where id = r.version_id;
  perform app.enforce_sod(v_caller, r.submitted_by, 'approve');   -- QA ≠ submitter
  perform app.enforce_sod(v_caller, v.created_by, 'approve');     -- QA ≠ author

  update public.approval_requests set status='approved', actor_id=v_caller, decided_at=now() where id=p_request;
  perform app.transition_version(r.version_id, 'approved', v_caller, null, 'D-QA-REVIEW');

  -- Training coupling seam (§6.5): ask the module; safe default (no training) when off.
  v_flow := app.begin_seam_flow(r.tenant_id, 'training');
  v_ans  := app.resolve_training(r.tenant_id, v_flow);
  if p_training_required and (v_ans->>'required')::boolean and not (v_ans->>'threshold_met')::boolean then
    update public.documents set status='pending_training', updated_at=now() where id=r.document_id;
    v_outcome := 'pending_training';
  elsif p_effective_date is not null and p_effective_date > current_date then
    update public.document_versions set scheduled_for = p_effective_date::timestamptz where id=r.version_id;
    update public.documents set status='scheduled', updated_at=now() where id=r.document_id;
    v_outcome := 'scheduled';
  else
    perform app.make_effective(r.version_id, v_caller, now(), 'D-QA-REVIEW');
    perform app.close_seam_flow(v_flow);
    v_outcome := 'active';
  end if;

  perform app.write_audit('document.approved', v_caller, null, r.tenant_id, r.org_id, r.department_id,
    'approval_request', p_request::text, null, jsonb_build_object('outcome', v_outcome), null, 'D-QA-REVIEW');
  return v_outcome;
end; $$;

-- Training threshold met → release to effective (§6.5). QA or trainer.
create or replace function public.release_training(p_document uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v public.document_versions; v_caller uuid := auth.uid();
begin
  select * into d from public.documents where id = p_document for update;
  if d.status <> 'pending_training' then raise exception 'release_training: document is not pending training'; end if;
  if not (app.is_qa(v_caller) or app.has_role(v_caller,'trainer')) then raise exception 'release_training: QA/trainer only'; end if;
  select * into v from public.document_versions where document_id=p_document and status='approved' order by created_at desc limit 1;
  perform app.make_effective(v.id, v_caller, now(), 'D-TRAINING');
  perform app.write_audit('training.released', v_caller, null, d.tenant_id, d.org_id, d.department_id,
    'document', p_document::text, jsonb_build_object('status','pending_training'), jsonb_build_object('status','active'),
    null, 'D-TRAINING');
end; $$;

-- Scheduled documents go live when their date arrives (called by a scheduled job).
create or replace function public.activate_scheduled()
returns int language plpgsql security definer set search_path = app, public as $$
declare v record; n int := 0;
begin
  for v in
    select dv.id as version_id, dv.scheduled_for, d.id as document_id
    from public.document_versions dv join public.documents d on d.id = dv.document_id
    where d.status='scheduled' and dv.status='approved' and dv.scheduled_for is not null and dv.scheduled_for <= now()
  loop
    perform app.make_effective(v.version_id, null, v.scheduled_for, 'scheduled-job');
    n := n + 1;
  end loop;
  return n;
end; $$;

revoke all on function public.update_draft(uuid,text,text,text) from public;
grant execute on function public.update_draft(uuid,text,text,text) to authenticated, service_role;
revoke all on function public.submit_document(uuid) from public;
revoke all on function public.endorse_request(uuid) from public;
revoke all on function public.request_changes(uuid,text) from public;
revoke all on function public.resubmit_document(uuid) from public;
revoke all on function public.reject_request(uuid,text) from public;
revoke all on function public.qa_approve(uuid,boolean,date) from public;
revoke all on function public.release_training(uuid) from public;
grant execute on function public.submit_document(uuid), public.endorse_request(uuid),
  public.request_changes(uuid,text), public.resubmit_document(uuid), public.reject_request(uuid,text),
  public.qa_approve(uuid,boolean,date), public.release_training(uuid) to authenticated, service_role;
grant execute on function public.activate_scheduled() to service_role;
