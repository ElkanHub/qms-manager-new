-- ============================================================================
-- dispatch_intake regression fix. The numbering_v2 migration (20260301000200)
-- re-replaced dispatch_intake from the Phase-7 body and silently dropped the
-- RETIRE branch that Phase 8 had wired in — a RETIRE intake was marked
-- 'dispatched' without ever creating the retirement request. This version is
-- the union of both: NEW_SOP (+ numbering), CHANGE (open the change control),
-- and RETIRE (file the retirement) all route correctly.
-- ============================================================================
create or replace function public.dispatch_intake(p_intake uuid, p_resume_document_id uuid default null)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare i public.intake_requests; v_type text; v_doc uuid; v_cc uuid; v_ret uuid;
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
      v_doc := p_resume_document_id;
    else
      select document_id into v_doc from app.create_document(i.tenant_id, i.org_id, i.department_id,
        coalesce(i.title,'Untitled'), null, i.requester_id, i.requester_id, i.content_ref, i.reason, 'D-INTAKE');
    end if;
    if (select document_number from public.documents where id = v_doc) is null then
      perform app.apply_number(v_doc, auth.uid());
    end if;
  elsif v_type in ('CHANGE_SINGLE','CHANGE_MULTI') then
    v_cc := public.create_change(i.target_ids, i.reason, i.id);   -- open the change control
  elsif v_type = 'RETIRE' then
    v_ret := public.request_retirement(i.target_ids[1], i.reason);
  end if;

  update public.intake_requests
    set status='dispatched', dispatched_type=v_type, dispatched_at=now(), created_document_id=v_doc
    where id=p_intake;
  perform app.write_audit('intake.dispatched', auth.uid(), null, i.tenant_id, i.org_id, i.department_id,
    'intake_request', p_intake::text, null,
    jsonb_build_object('type', v_type, 'document', v_doc, 'change_control', v_cc, 'retirement', v_ret,
                       'resumed', p_resume_document_id is not null), null, 'D-INTAKE');
  return coalesce(v_doc, v_cc, v_ret);
end; $$;
