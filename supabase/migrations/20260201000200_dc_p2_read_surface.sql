-- ============================================================================
-- Document-Control Phase 2 — Read surface & rendition (CORE, never off)
-- The intrinsic ability to read the CURRENT EFFECTIVE version, read-only, via a
-- configurable renderer (MS online default). A lens over the version store — no
-- second copy. Refines Phase 1 RLS to the A.4 model: effective content is readable
-- tenant-wide; in-flight versions are scoped to those party to them.
-- ============================================================================

-- The read-only rendition served to viewers (locked at effective time; not the
-- editable source). Prepared when a version goes effective.
alter table public.document_versions add column if not exists rendition_ref text;

-- The 'library' module owns presentation config for the read/browse experience:
-- the renderer choice and read-tracking flag (both per-tenant, presentation-level).
-- The module's browsing EXPERIENCE is built in Phase 3; the read SURFACE here is core.
insert into public.modules (key, label, description, audit_compliant) values
  ('library', 'SOP Library', 'Browse experience + renderer/read-tracking config over the core read surface.', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Party-to-a-document check (A.4): who may see IN-FLIGHT versions of a document.
-- Author/owner, same-department users, and QA. Effective content is NOT gated by
-- this — it is tenant-wide.
-- ---------------------------------------------------------------------------
create or replace function app.is_party_to_document(p_document uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = app, public as $$
  select exists (
    select 1 from public.documents d
    left join public.users u on u.id = p_user
    where d.id = p_document
      and (d.owner_id = p_user
           or (u.department_id is not null and u.department_id = d.department_id)
           or app.is_qa(p_user))
  );
$$;
grant execute on function app.is_party_to_document(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS refinement (A.4): effective is tenant-wide; in-flight is party-scoped.
-- ---------------------------------------------------------------------------
drop policy if exists documents_tenant_select on public.documents;
create policy documents_read on public.documents for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (status not in ('draft','in_review')            -- effective/active-ish: tenant-wide
         or app.is_party_to_document(id, auth.uid()))    -- in-flight: party only
  );

drop policy if exists versions_tenant_select on public.document_versions;
create policy versions_read on public.document_versions for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (status = 'effective'                             -- effective versions: tenant-wide (A.4)
         or app.is_party_to_document(document_id, auth.uid()))  -- in-flight: party only
  );

-- ---------------------------------------------------------------------------
-- Renderer coupling seam. Default 'ms_online' (client is M365). Swappable to
-- 'internal' (PDF) per tenant without touching core. If the configured renderer
-- is unavailable at read time, the viewer falls back to the internal rendition
-- (handled in the viewer component) so reading never breaks.
-- ---------------------------------------------------------------------------
create or replace function app.resolve_renderer(p_tenant uuid) returns text
language sql stable security definer set search_path = app, public as $$
  select coalesce(
    (select config->>'renderer' from public.tenant_modules
     where tenant_id = p_tenant and module_key = 'library'),
    'ms_online');
$$;

create or replace function app.read_tracking_enabled(p_tenant uuid) returns boolean
language sql stable security definer set search_path = app, public as $$
  select coalesce(
    (select (config->>'read_tracking')::boolean from public.tenant_modules
     where tenant_id = p_tenant and module_key = 'library'),
    false);
$$;

-- Prepare the read-only rendition when a version goes effective (extend Phase 1's
-- make_effective). The rendition pointer is locked at effective time.
create or replace function app.make_effective(
  p_version uuid, p_actor uuid, p_effective_from timestamptz default now(), p_source text default null)
returns int
language plpgsql security definer set search_path = app, public as $$
declare
  v public.document_versions;
  v_prev public.document_versions;
  v_rev int;
begin
  select * into v from public.document_versions where id = p_version for update;
  if v.id is null then raise exception 'make_effective: no such version'; end if;
  if v.status <> 'approved' then
    raise exception 'make_effective: version must be approved (is %)', v.status;
  end if;

  select * into v_prev from public.document_versions
    where document_id = v.document_id and status = 'effective' for update;
  if v_prev.id is not null then
    update public.document_versions set status = 'superseded', superseded_at = p_effective_from where id = v_prev.id;
    perform app.write_audit('version.superseded', p_actor, null, v_prev.tenant_id, v_prev.org_id, v_prev.department_id,
      'document_version', v_prev.id::text, jsonb_build_object('status','effective'),
      jsonb_build_object('status','superseded'), null, p_source);
  end if;

  select coalesce(max(revision_number), -1) + 1 into v_rev
    from public.document_versions where document_id = v.document_id;
  update public.document_versions
    set status = 'effective', effective_from = p_effective_from, revision_number = v_rev,
        rendition_ref = coalesce(rendition_ref, content_ref)   -- lock the served rendition
    where id = v.id;
  update public.documents set status = 'active', current_version_id = v.id, updated_at = now()
    where id = v.document_id;

  perform app.write_audit('version.effective', p_actor, null, v.tenant_id, v.org_id, v.department_id,
    'document_version', v.id::text, jsonb_build_object('status','approved'),
    jsonb_build_object('status','effective','revision', v_rev), null, p_source);
  return v_rev;
end; $$;

-- ---------------------------------------------------------------------------
-- read_document — THE read surface. Serves ONLY the effective version, read-only,
-- to any tenant user (A.4). Cross-tenant denied. Optionally records a read event
-- (per-tenant read-tracking). This is the sole core consumption entry point.
-- ---------------------------------------------------------------------------
create or replace function public.read_document(p_document uuid)
returns table(version_id uuid, revision_number int, title text, document_number text,
              effective_from timestamptz, renderer text, rendition_ref text)
language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v public.document_versions;
begin
  select * into d from public.documents where id = p_document;
  if d.id is null then raise exception 'read_document: no such document'; end if;
  if d.tenant_id <> public.current_tenant_id() then
    raise exception 'read_document: cross-tenant read denied';   -- A.4 is tenant-wide, not cross-tenant
  end if;

  select * into v from public.document_versions where document_id = p_document and status = 'effective';
  if v.id is null then raise exception 'read_document: no effective version'; end if;  -- in-flight never served here

  if app.read_tracking_enabled(d.tenant_id) then
    perform app.write_audit('document.read', auth.uid(), null, d.tenant_id, d.org_id, d.department_id,
      'document_version', v.id::text, null, null, null, 'D-READ');
  end if;

  version_id := v.id; revision_number := v.revision_number; title := d.title;
  document_number := d.document_number; effective_from := v.effective_from;
  renderer := app.resolve_renderer(d.tenant_id); rendition_ref := v.rendition_ref;
  return next;
end; $$;

revoke all on function public.read_document(uuid) from public;
grant execute on function public.read_document(uuid) to authenticated, service_role;
grant execute on function app.resolve_renderer(uuid), app.read_tracking_enabled(uuid) to authenticated, service_role;
