-- ============================================================================
-- Document-Control Phase 5 — Unified intake & routing (one door)
-- One entry point infers the request type from context, shows the rationale, lets
-- the user confirm or dispute (QA-arbitrated), surfaces an abandoned-draft fork, and
-- LOCKS the type at dispatch. Inference keys off an EFFECTIVE version existing (§5.2),
-- never any row. The pipes (Phases 6-8) build their entities from a dispatched intake.
-- ============================================================================

create table if not exists public.intake_requests (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id),
  org_id              uuid not null references public.organizations(id),
  department_id       uuid references public.departments(id),
  requester_id        uuid not null references public.users(id),
  title               text,
  reason              text not null,
  target_ids          uuid[] not null default '{}',
  discontinue_intent  boolean not null default false,
  content_ref         text,
  inferred_type       text not null check (inferred_type in ('NEW_SOP','CHANGE_SINGLE','CHANGE_MULTI','RETIRE')),
  confirmed_type      text check (confirmed_type in ('NEW_SOP','CHANGE_SINGLE','CHANGE_MULTI','RETIRE')),
  status              text not null default 'capturing' check (status in ('capturing','disputed','dispatched')),
  created_document_id uuid references public.documents(id),
  dispatched_type     text,
  dispatched_at       timestamptz,
  dispute_reason      text,
  created_at          timestamptz not null default now()
);
create index if not exists intake_tenant_idx on public.intake_requests (tenant_id, status);

drop trigger if exists freeze_tenant_id on public.intake_requests;
create trigger freeze_tenant_id before update on public.intake_requests
  for each row execute function app.freeze_tenant_id();

alter table public.intake_requests enable row level security;
alter table public.intake_requests force row level security;
drop policy if exists intake_read on public.intake_requests;
create policy intake_read on public.intake_requests for select to authenticated
  using (tenant_id = public.current_tenant_id() and (requester_id = auth.uid() or app.is_qa(auth.uid())));
grant select on public.intake_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Inference (§5.2). Keys off whether targets have an EFFECTIVE version — an
-- abandoned draft (no effective version) must NOT misroute a new SOP as a change.
-- ---------------------------------------------------------------------------
create or replace function app.infer_intake_type(p_targets uuid[], p_discontinue boolean) returns text
language plpgsql stable security definer set search_path = app, public as $$
declare v_effective int;
begin
  select count(*) into v_effective from public.document_versions
   where document_id = any(coalesce(p_targets,'{}')) and status = 'effective';
  if p_discontinue and v_effective >= 1 then return 'RETIRE'; end if;
  if v_effective = 0 then return 'NEW_SOP'; end if;      -- no effective target
  if v_effective = 1 then return 'CHANGE_SINGLE'; end if;
  return 'CHANGE_MULTI';
end; $$;

-- Abandoned-draft detection: an unfinished draft this requester already started
-- with a matching title (§5.5).
create or replace function app.find_abandoned_draft(p_tenant uuid, p_requester uuid, p_title text) returns uuid
language sql stable security definer set search_path = app, public as $$
  select id from public.documents
  where tenant_id = p_tenant and owner_id = p_requester and status = 'draft'
    and p_title is not null and lower(title) = lower(p_title)
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- start_intake — capture + infer. Returns the inferred type (for the visible
-- rationale) and any abandoned draft to fork on.
-- ---------------------------------------------------------------------------
create or replace function public.start_intake(
  p_reason text, p_title text default null, p_targets uuid[] default '{}',
  p_discontinue boolean default false, p_content_ref text default null)
returns table(intake_id uuid, inferred_type text, abandoned_draft_id uuid)
language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_type text; v_id uuid; v_aband uuid;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'start_intake: not an org user'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then raise exception 'start_intake: a reason is required'; end if;

  v_type := app.infer_intake_type(p_targets, p_discontinue);
  insert into public.intake_requests(tenant_id, org_id, department_id, requester_id, title, reason,
    target_ids, discontinue_intent, content_ref, inferred_type)
    values (v_ctx.tenant_id, v_ctx.org_id, v_ctx.department_id, v_caller, p_title, p_reason,
      coalesce(p_targets,'{}'), p_discontinue, p_content_ref, v_type) returning id into v_id;

  if v_type = 'NEW_SOP' then v_aband := app.find_abandoned_draft(v_ctx.tenant_id, v_caller, p_title); end if;

  perform app.write_audit('intake.started', v_caller, null, v_ctx.tenant_id, v_ctx.org_id, v_ctx.department_id,
    'intake_request', v_id::text, null, jsonb_build_object('inferred', v_type, 'targets', p_targets),
    p_reason, 'D-INTAKE');
  intake_id := v_id; inferred_type := v_type; abandoned_draft_id := v_aband; return next;
end; $$;

-- Dispute the inferred type → routes to QA (§5.4). Requester only, reason logged.
create or replace function public.dispute_intake(p_intake uuid, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare i public.intake_requests;
begin
  select * into i from public.intake_requests where id = p_intake for update;
  if i.id is null then raise exception 'dispute_intake: no such intake'; end if;
  if i.requester_id <> auth.uid() then raise exception 'dispute_intake: only the requester may dispute'; end if;
  if i.status = 'dispatched' then raise exception 'dispute_intake: already dispatched (type locked)'; end if;
  update public.intake_requests set status='disputed', dispute_reason=p_reason where id=p_intake;
  perform app.write_audit('intake.disputed', auth.uid(), null, i.tenant_id, i.org_id, i.department_id,
    'intake_request', p_intake::text, jsonb_build_object('inferred', i.inferred_type), null, p_reason, 'D-INTAKE');
end; $$;

-- QA re-evaluates a disputed type; the override is logged (§5.4). Re-opens for dispatch.
create or replace function public.resolve_intake_dispute(p_intake uuid, p_type text, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare i public.intake_requests; v_caller uuid := auth.uid();
begin
  select * into i from public.intake_requests where id = p_intake for update;
  if i.id is null then raise exception 'resolve_intake_dispute: no such intake'; end if;
  if not (app.is_qa(v_caller) and (select tenant_id from app.actor_context(v_caller)) = i.tenant_id) then
    raise exception 'resolve_intake_dispute: QA of the tenant only';
  end if;
  update public.intake_requests set confirmed_type=p_type, status='capturing' where id=p_intake;
  perform app.write_audit('intake.type_overridden', v_caller, null, i.tenant_id, i.org_id, i.department_id,
    'intake_request', p_intake::text, jsonb_build_object('type', i.inferred_type),
    jsonb_build_object('type', p_type), p_reason, 'D-INTAKE');
end; $$;

-- ---------------------------------------------------------------------------
-- dispatch_intake — LOCK the type and route into the pipe (§5.6). NEW_SOP creates
-- the draft document now (or resumes the forked draft). CHANGE_*/RETIRE mark the
-- intake dispatched; the pipe (Phase 7/8) builds its entity from this record.
-- After dispatch the type is immutable.
-- ---------------------------------------------------------------------------
create or replace function public.dispatch_intake(p_intake uuid, p_resume_document_id uuid default null)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare i public.intake_requests; v_type text; v_doc uuid; v_ver uuid;
begin
  select * into i from public.intake_requests where id = p_intake for update;
  if i.id is null then raise exception 'dispatch_intake: no such intake'; end if;
  if i.status = 'dispatched' then raise exception 'dispatch_intake: type already locked at dispatch'; end if;
  if i.requester_id <> auth.uid() and not app.is_qa(auth.uid()) then
    raise exception 'dispatch_intake: requester or QA only';
  end if;
  v_type := coalesce(i.confirmed_type, i.inferred_type);

  if v_type = 'NEW_SOP' then
    if p_resume_document_id is not null then
      v_doc := p_resume_document_id;   -- resume the abandoned draft (choice logged below)
    else
      select document_id into v_doc from app.create_document(i.tenant_id, i.org_id, i.department_id,
        coalesce(i.title,'Untitled'), null, i.requester_id, i.requester_id, i.content_ref, i.reason, 'D-INTAKE');
    end if;
  end if;

  update public.intake_requests
    set status='dispatched', dispatched_type=v_type, dispatched_at=now(), created_document_id=v_doc
    where id=p_intake;
  perform app.write_audit('intake.dispatched', auth.uid(), null, i.tenant_id, i.org_id, i.department_id,
    'intake_request', p_intake::text, null,
    jsonb_build_object('type', v_type, 'document', v_doc, 'resumed', p_resume_document_id is not null),
    null, 'D-INTAKE');
  return v_doc;   -- null for CHANGE_*/RETIRE (pipe builds their entity)
end; $$;

revoke all on function public.start_intake(text,text,uuid[],boolean,text) from public;
revoke all on function public.dispute_intake(uuid,text) from public;
revoke all on function public.resolve_intake_dispute(uuid,text,text) from public;
revoke all on function public.dispatch_intake(uuid,uuid) from public;
grant execute on function public.start_intake(text,text,uuid[],boolean,text),
  public.dispute_intake(uuid,text), public.resolve_intake_dispute(uuid,text,text),
  public.dispatch_intake(uuid,uuid) to authenticated, service_role;
grant execute on function app.infer_intake_type(uuid[],boolean),
  app.find_abandoned_draft(uuid,uuid,text) to authenticated, service_role;
