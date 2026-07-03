-- ============================================================================
-- Numbering v2 — segment-based, reorderable company formats + the pipe wiring
-- that P4 left dangling (apply_number had no caller: documents born through
-- intake were never numbered).
--
-- The format becomes an ordered list of segments the client arranges freely:
--   {"segments":[{"type":"text","value":"SOP"},{"type":"department"},
--                {"type":"sequence","pad":3}],
--    "sep":"-", "scope":"tenant"|"department"}
-- → SOP-QA-001, QA-SOP-001, 001-SOP-QA … whatever their convention is.
-- The department tag comes from the ORIGINATING department captured by the
-- starter request (intake), via a short department code (new column, with a
-- name-derived fallback). Sequence scope is QA's choice: one company-wide
-- counter, or an independent counter per department.
--
-- Back-compat: the P4 shape {"prefix","sep","pad"} still renders identically
-- (prefix + sep + padded seq, tenant scope). Legacy documents stay untouched;
-- going-forward uniqueness is unchanged.
-- ============================================================================

-- Department short code (the tag in the number). Falls back to the first three
-- letters of the name, uppercased, when unset.
alter table public.departments add column if not exists code text
  check (code is null or code ~ '^[A-Za-z0-9]{1,8}$');
create unique index if not exists departments_code_unique
  on public.departments (org_id, upper(code)) where code is not null;

create or replace function app.department_code(p_department uuid) returns text
language sql stable security definer set search_path = app, public as $$
  select coalesce(
    upper(code),
    upper(left(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'), 3)),
    'GEN')
  from public.departments where id = p_department;
$$;
grant execute on function app.department_code(uuid) to authenticated, service_role;

create or replace function public.set_department_code(p_department uuid, p_code text)
returns void language plpgsql security definer set search_path = app, public as $$
declare d public.departments; v_caller uuid := auth.uid();
begin
  select * into d from public.departments where id = p_department;
  if d.id is null or d.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'set_department_code: no such department'; end if;
  if not (app.is_qa(v_caller) or app.has_role(v_caller, 'org_admin')) then
    raise exception 'set_department_code: QA or org admin only'; end if;
  update public.departments set code = nullif(upper(trim(p_code)), '') where id = p_department;
  perform app.write_audit('department.code_set', v_caller, null, d.tenant_id, d.org_id, p_department,
    'department', p_department::text, jsonb_build_object('code', d.code),
    jsonb_build_object('code', nullif(upper(trim(p_code)), '')), null, 'S-DEPARTMENTS');
end; $$;
revoke all on function public.set_department_code(uuid, text) from public;
grant execute on function public.set_department_code(uuid, text) to authenticated, service_role;

-- Per-department sequence counters (used when scope = 'department';
-- numbering_formats.next_seq stays the company-wide counter).
create table if not exists public.numbering_dept_sequences (
  tenant_id     uuid not null references public.tenants(id),
  department_id uuid not null references public.departments(id),
  next_seq      int not null default 1,
  primary key (tenant_id, department_id)
);
alter table public.numbering_dept_sequences enable row level security;
alter table public.numbering_dept_sequences force row level security;
drop policy if exists numbering_dept_seq_read on public.numbering_dept_sequences;
create policy numbering_dept_seq_read on public.numbering_dept_sequences for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.numbering_dept_sequences to authenticated;

-- Normalize either format shape into v2 segments (single place, so the
-- renderer, the validator and the preview all agree).
create or replace function app.numbering_segments(p_format jsonb) returns jsonb
language sql immutable as $$
  select case
    when p_format ? 'segments' then p_format->'segments'
    else jsonb_build_array(
      jsonb_build_object('type','text','value', coalesce(p_format->>'prefix','DOC')),
      jsonb_build_object('type','sequence','pad', coalesce((p_format->>'pad')::int, 3)))
  end;
$$;

-- Render + allocate the next number. Segments in the client's order; the
-- sequence comes from the company-wide counter or the department's own,
-- per the format's scope. Returns null when the module is off / unconfigured
-- (caller falls back to the system-default display number).
create or replace function app.render_next_number(p_tenant uuid, p_department uuid)
returns text language plpgsql security definer set search_path = app, public as $$
declare f public.numbering_formats; v_segments jsonb; v_seg jsonb; v_sep text; v_scope text;
        v_seq int; v_parts text[] := '{}'; v_pad int;
begin
  if not app.module_enabled(p_tenant, 'numbering') then return null; end if;
  select * into f from public.numbering_formats where tenant_id = p_tenant for update;
  if f.tenant_id is null then return null; end if;

  v_segments := app.numbering_segments(f.format);
  v_sep   := coalesce(f.format->>'sep', '-');
  v_scope := coalesce(f.format->>'scope', 'tenant');

  -- Allocate the sequence from the right counter, atomically.
  if v_scope = 'department' and p_department is not null then
    insert into public.numbering_dept_sequences(tenant_id, department_id)
      values (p_tenant, p_department)
      on conflict (tenant_id, department_id) do nothing;
    select next_seq into v_seq from public.numbering_dept_sequences
      where tenant_id = p_tenant and department_id = p_department for update;
    update public.numbering_dept_sequences set next_seq = next_seq + 1
      where tenant_id = p_tenant and department_id = p_department;
  else
    v_seq := f.next_seq;
    update public.numbering_formats set next_seq = next_seq + 1 where tenant_id = p_tenant;
  end if;

  for v_seg in select * from jsonb_array_elements(v_segments) loop
    case v_seg->>'type'
      when 'text' then
        v_parts := v_parts || coalesce(v_seg->>'value', '');
      when 'department' then
        v_parts := v_parts || coalesce(
          case when p_department is null then null else app.department_code(p_department) end, 'GEN');
      when 'sequence' then
        v_pad := coalesce((v_seg->>'pad')::int, 3);
        v_parts := v_parts || lpad(v_seq::text, v_pad, '0');
      else
        raise exception 'render_next_number: unknown segment type %', v_seg->>'type';
    end case;
  end loop;
  return array_to_string(v_parts, v_sep);
end; $$;
grant execute on function app.render_next_number(uuid, uuid) to service_role;

-- P4's one-arg allocator becomes a thin wrapper (kept for existing callers and
-- tests: old-shape formats render exactly as before, tenant-scoped).
drop function if exists app.next_document_number(uuid);
create or replace function app.next_document_number(p_tenant uuid, p_department uuid default null)
returns text language sql security definer set search_path = app, public as $$
  select app.render_next_number(p_tenant, p_department);
$$;
grant execute on function app.next_document_number(uuid, uuid) to service_role;

-- apply_number v2: the document's own (originating) department feeds the tag.
create or replace function app.apply_number(p_document uuid, p_actor uuid) returns text
language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v_num text;
begin
  select * into d from public.documents where id = p_document for update;
  if d.id is null then raise exception 'apply_number: no such document'; end if;
  v_num := app.render_next_number(d.tenant_id, d.department_id);
  if v_num is null then
    v_num := 'DOC-' || upper(left(replace(d.id::text,'-',''), 8));  -- system-default display number
  end if;
  update public.documents set document_number = v_num where id = p_document;
  perform app.write_audit('document.numbered', p_actor, null, d.tenant_id, d.org_id, d.department_id,
    'document', p_document::text, jsonb_build_object('number', d.document_number),
    jsonb_build_object('number', v_num), null, 'numbering');
  return v_num;
end; $$;

-- Validate + save the format (QA-owned, audited). Accepts both shapes; v2 must
-- have exactly one sequence segment and only known segment types.
create or replace function public.set_numbering_format(p_format jsonb)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_old jsonb; v_seg jsonb; v_seq_count int := 0;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if not app.is_qa(v_caller) then raise exception 'set_numbering_format: QA only'; end if;

  if p_format ? 'segments' then
    if jsonb_typeof(p_format->'segments') <> 'array' or jsonb_array_length(p_format->'segments') = 0 then
      raise exception 'set_numbering_format: segments must be a non-empty array'; end if;
    for v_seg in select * from jsonb_array_elements(p_format->'segments') loop
      if v_seg->>'type' not in ('text','department','sequence') then
        raise exception 'set_numbering_format: unknown segment type %', v_seg->>'type'; end if;
      if v_seg->>'type' = 'sequence' then v_seq_count := v_seq_count + 1; end if;
      if v_seg->>'type' = 'text' and length(trim(coalesce(v_seg->>'value',''))) = 0 then
        raise exception 'set_numbering_format: a text segment needs a value'; end if;
    end loop;
    if v_seq_count <> 1 then
      raise exception 'set_numbering_format: exactly one sequence segment required (found %)', v_seq_count; end if;
    if coalesce(p_format->>'scope','tenant') not in ('tenant','department') then
      raise exception 'set_numbering_format: scope must be tenant or department'; end if;
  end if;

  select format into v_old from public.numbering_formats where tenant_id = v_ctx.tenant_id;
  insert into public.numbering_formats(tenant_id, format, updated_by, updated_at)
    values (v_ctx.tenant_id, p_format, v_caller, now())
    on conflict (tenant_id) do update set format = excluded.format, updated_by = v_caller, updated_at = now();
  perform app.write_audit('numbering.format_set', v_caller, null, v_ctx.tenant_id, v_ctx.org_id, null,
    'numbering_format', v_ctx.tenant_id::text, v_old, p_format, null, 'D-NUMBERING-CONFIG');
end; $$;

-- THE PIPE WIRING (the gap): a NEW_SOP born at dispatch gets its number there,
-- carrying the originating department from the starter request. Resumed drafts
-- that never got a number are stamped too; numbered ones keep theirs.
create or replace function public.dispatch_intake(p_intake uuid, p_resume_document_id uuid default null)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare i public.intake_requests; v_type text; v_doc uuid; v_cc uuid;
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
  -- RETIRE is wired in Phase 8.
  end if;

  update public.intake_requests
    set status='dispatched', dispatched_type=v_type, dispatched_at=now(), created_document_id=v_doc
    where id=p_intake;
  perform app.write_audit('intake.dispatched', auth.uid(), null, i.tenant_id, i.org_id, i.department_id,
    'intake_request', p_intake::text, null,
    jsonb_build_object('type', v_type, 'document', v_doc, 'change_control', v_cc,
                       'resumed', p_resume_document_id is not null), null, 'D-INTAKE');
  return coalesce(v_doc, v_cc);
end; $$;
