-- ============================================================================
-- Flow Map module — a read-only visual of where an SOP sits in the document-
-- control flow (mirrors DOCS/core_build_state_with_seams.png). Registered as a
-- switchboard module so it is controllable per tenant from day one (off by
-- default, like every module). QA-department members and org admins may inspect;
-- every inspection is on the audit chain.
--
-- The module owns NO document data. flow_inspect reads the document's live
-- lifecycle pointer (documents.status) and, when locked in change control, the
-- change's current sub-stage — nothing here writes state, it only reports it.
-- ============================================================================

insert into public.modules (key, label, description, audit_compliant, category, sort_order, upcoming) values
  ('flow_map', 'Document Flow Map',
   'A visual of the document-control flow with live SOP position: search a document and see exactly which stage it is at, from intake through effective, change control and retirement.',
   true, 'document_control', 5, false)
on conflict (key) do update
  set label = excluded.label, description = excluded.description,
      category = excluded.category, sort_order = excluded.sort_order, upcoming = excluded.upcoming;

-- flow_inspect — the single audited read behind the Flow Map. Gates on module
-- state AND authority (QA dept or org admin), records the inspection, and returns
-- the SOP's live stage plus, when under change control, that change's sub-stage.
create or replace function public.flow_inspect(p_document uuid)
returns table(document_number text, title text, doc_status text,
              version_status text, revision int, cc_status text, cc_id uuid)
language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v_caller uuid := auth.uid(); v_ctx record;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if not app.module_enabled(v_ctx.tenant_id, 'flow_map') then
    raise exception 'flow_inspect: the Document Flow Map is not enabled for this organization'; end if;
  if not (app.is_qa(v_caller) or app.has_role(v_caller, 'org_admin')) then
    raise exception 'flow_inspect: QA or org admin only'; end if;

  select * into d from public.documents where id = p_document;
  if d.id is null or d.tenant_id is distinct from v_ctx.tenant_id then
    raise exception 'flow_inspect: no such document'; end if;

  -- Latest version reflects the current work (draft in-flight, or the effective one).
  select dv.status, dv.revision_number into version_status, revision
    from public.document_versions dv where dv.document_id = p_document
    order by dv.created_at desc limit 1;

  -- If locked in change control, surface that change's current sub-stage.
  if d.status = 'locked_in_cc' then
    select c.status, c.id into cc_status, cc_id
      from public.change_control_documents ccd
      join public.change_controls c on c.id = ccd.change_control_id
      where ccd.document_id = p_document and c.status not in ('closed','rejected')
      order by c.created_at desc limit 1;
  end if;

  perform app.write_audit('flow.inspected', v_caller, null, d.tenant_id, d.org_id, d.department_id,
    'document', p_document::text, null,
    jsonb_build_object('stage', d.status, 'cc_status', cc_status), null, 'F-FLOW');

  document_number := d.document_number; title := d.title; doc_status := d.status;
  return next;
end; $$;

revoke all on function public.flow_inspect(uuid) from public;
grant execute on function public.flow_inspect(uuid) to authenticated, service_role;
