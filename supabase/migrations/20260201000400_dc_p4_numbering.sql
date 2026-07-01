-- ============================================================================
-- Document-Control Phase 4 — Numbering module (format as METADATA, never identity)
-- The company's SOP number is a displayed/searchable label over the immutable
-- system id (A.3). Module on/off is on the switchboard (platform); the FORMAT is
-- QA-owned (org-side). Going-forward uniqueness is enforced; legacy imports keep
-- their duplicates/inconsistencies as historical fact — never "fixed".
-- ============================================================================

insert into public.modules (key, label, description, audit_compliant) values
  ('numbering', 'Numbering', 'Company SOP-number format applied as metadata over the system id.', true)
on conflict (key) do nothing;

-- Legacy rows are exempt from going-forward uniqueness (they carry the historical mess).
alter table public.documents add column if not exists is_legacy boolean not null default false;

-- Going-forward uniqueness: non-legacy documents with a number must be unique per tenant.
-- Legacy rows and null numbers are excluded, so duplicates survive untouched (A.3).
create unique index if not exists documents_number_going_forward
  on public.documents (tenant_id, document_number)
  where not is_legacy and document_number is not null;

-- QA-owned format definition (separate from the platform-controlled switchboard config,
-- so QA authors the convention while the platform holds the on/off switch). next_seq is
-- the per-tenant sequence counter.
create table if not exists public.numbering_formats (
  tenant_id  uuid primary key references public.tenants(id),
  format     jsonb not null default '{}'::jsonb,   -- e.g. {"prefix":"SOP","sep":"-","pad":3}
  next_seq   int not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.numbering_formats enable row level security;
alter table public.numbering_formats force row level security;
drop policy if exists numbering_formats_read on public.numbering_formats;
create policy numbering_formats_read on public.numbering_formats for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.numbering_formats to authenticated;

-- QA sets the company's number format. QA-owned (A.5), audited.
create or replace function public.set_numbering_format(p_format jsonb)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_old jsonb;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if not app.is_qa(v_caller) then raise exception 'set_numbering_format: QA only'; end if;
  select format into v_old from public.numbering_formats where tenant_id = v_ctx.tenant_id;
  insert into public.numbering_formats(tenant_id, format, updated_by, updated_at)
    values (v_ctx.tenant_id, p_format, v_caller, now())
    on conflict (tenant_id) do update set format = excluded.format, updated_by = v_caller, updated_at = now();
  perform app.write_audit('numbering.format_set', v_caller, null, v_ctx.tenant_id, v_ctx.org_id, null,
    'numbering_format', v_ctx.tenant_id::text, v_old, p_format, null, 'D-NUMBERING-CONFIG');
end; $$;

-- Allocate the next number per the format, incrementing the sequence atomically.
-- Returns null if the module is off or no format is defined (caller uses a default).
create or replace function app.next_document_number(p_tenant uuid) returns text
language plpgsql security definer set search_path = app, public as $$
declare f public.numbering_formats; v_seq int; v_prefix text; v_sep text; v_pad int;
begin
  if not app.module_enabled(p_tenant, 'numbering') then return null; end if;
  select * into f from public.numbering_formats where tenant_id = p_tenant for update;
  if f.tenant_id is null then return null; end if;
  v_seq := f.next_seq;
  update public.numbering_formats set next_seq = next_seq + 1 where tenant_id = p_tenant;
  v_prefix := coalesce(f.format->>'prefix', 'DOC');
  v_sep    := coalesce(f.format->>'sep', '-');
  v_pad    := coalesce((f.format->>'pad')::int, 3);
  return v_prefix || v_sep || lpad(v_seq::text, v_pad, '0');
end; $$;

-- Apply a number to a going-forward document. If numbering is on, generate per format;
-- if off, fall back to a system-default display number derived from the system id.
-- Identity (documents.id) is untouched either way.
create or replace function app.apply_number(p_document uuid, p_actor uuid) returns text
language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v_num text;
begin
  select * into d from public.documents where id = p_document for update;
  if d.id is null then raise exception 'apply_number: no such document'; end if;
  v_num := app.next_document_number(d.tenant_id);
  if v_num is null then
    v_num := 'DOC-' || upper(left(replace(d.id::text,'-',''), 8));  -- system-default display number
  end if;
  update public.documents set document_number = v_num where id = p_document;
  perform app.write_audit('document.numbered', p_actor, null, d.tenant_id, d.org_id, d.department_id,
    'document', p_document::text, jsonb_build_object('number', d.document_number),
    jsonb_build_object('number', v_num), null, 'numbering');
  return v_num;
end; $$;

-- Import a legacy document: number preserved as-is (duplicates allowed), flagged legacy,
-- with its first version already effective (historical fact). No "fixing".
create or replace function app.import_legacy_document(
  p_tenant uuid, p_org uuid, p_department uuid, p_title text, p_number text,
  p_owner uuid, p_actor uuid, p_effective_from timestamptz default now())
returns table(document_id uuid, version_id uuid)
language plpgsql security definer set search_path = app, public as $$
declare v_doc uuid; v_ver uuid;
begin
  insert into public.documents(tenant_id, org_id, department_id, document_number, title, status, owner_id, is_legacy, current_version_id)
    values (p_tenant, p_org, p_department, p_number, p_title, 'active', p_owner, true, null) returning id into v_doc;
  insert into public.document_versions(document_id, tenant_id, org_id, department_id, revision_number, status, effective_from, created_by)
    values (v_doc, p_tenant, p_org, p_department, 0, 'effective', p_effective_from, p_actor) returning id into v_ver;
  update public.documents set current_version_id = v_ver where id = v_doc;
  perform app.write_audit('document.imported_legacy', p_actor, null, p_tenant, p_org, p_department,
    'document', v_doc::text, null, jsonb_build_object('number', p_number, 'legacy', true), null, 'migration');
  document_id := v_doc; version_id := v_ver; return next;
end; $$;

grant execute on function app.next_document_number(uuid), app.apply_number(uuid, uuid),
  app.import_legacy_document(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz) to service_role;
revoke all on function public.set_numbering_format(jsonb) from public;
grant execute on function public.set_numbering_format(jsonb) to authenticated, service_role;
