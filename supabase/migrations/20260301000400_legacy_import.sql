-- ============================================================================
-- Legacy library bulk import (roadmap #8) — the surface over
-- app.import_legacy_document (P4), which preserves historical numbers as-is
-- (duplicates allowed on distinct system ids, is_legacy exempts them from
-- going-forward uniqueness) and lands every row on the audit chain.
--
-- One batched RPC, two modes:
--   dry run (default) — validate every row, return the full report, write
--     NOTHING. This is where the migrator sees unresolved departments, bad
--     dates, missing titles, and which historical numbers repeat.
--   commit — only proceeds when EVERY row is valid (atomic: a migration
--     either lands whole or not at all); returns the same report shape.
--
-- Row shape: {"number","title","department","owner_email","effective_date"}
--   department  — matched by department code or name (case-insensitive)
--   owner_email — optional; resolves within the tenant; default = the importer
--   effective_date — optional (default now); must parse and not be future
-- ============================================================================

create or replace function public.import_legacy_library(p_rows jsonb, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare
  v_caller uuid := auth.uid(); v_ctx record; r jsonb; v_idx int := 0;
  v_number text; v_title text; v_dept_key text; v_dept uuid; v_owner uuid; v_eff timestamptz;
  v_problems text[]; v_errors jsonb := '[]'; v_dupes_existing text[] := '{}'; v_dupes_infile text[] := '{}';
  v_seen text[] := '{}'; v_ok int := 0;
begin
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'import_legacy_library: no org context'; end if;
  if not (app.is_qa(v_caller) or app.has_role(v_caller, 'org_admin')) then
    raise exception 'import_legacy_library: QA or org admin only'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'import_legacy_library: a non-empty rows array is required'; end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'import_legacy_library: max 1000 rows per batch'; end if;

  -- Pass 1 — validate everything (both modes), so commit is all-or-nothing.
  for r in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    v_problems := '{}';
    v_number   := nullif(trim(coalesce(r->>'number','')), '');
    v_title    := nullif(trim(coalesce(r->>'title','')), '');
    v_dept_key := nullif(trim(coalesce(r->>'department','')), '');

    if v_number is null then v_problems := array_append(v_problems, 'number is required'); end if;
    if v_title  is null then v_problems := array_append(v_problems, 'title is required'); end if;

    v_dept := null;
    if v_dept_key is null then
      v_problems := array_append(v_problems, 'department is required');
    else
      select id into v_dept from public.departments
        where tenant_id = v_ctx.tenant_id
          and (upper(coalesce(code,'')) = upper(v_dept_key) or lower(name) = lower(v_dept_key))
        limit 1;
      if v_dept is null then
        v_problems := array_append(v_problems, format('department "%s" not found (by code or name)', v_dept_key));
      end if;
    end if;

    if nullif(trim(coalesce(r->>'owner_email','')), '') is not null then
      select id into v_owner from public.users
        where tenant_id = v_ctx.tenant_id and lower(email) = lower(trim(r->>'owner_email')) limit 1;
      if v_owner is null then
        v_problems := array_append(v_problems, format('owner "%s" is not a user of this organization', r->>'owner_email'));
      end if;
    end if;

    if nullif(trim(coalesce(r->>'effective_date','')), '') is not null then
      begin
        v_eff := (r->>'effective_date')::timestamptz;
        if v_eff > now() then v_problems := array_append(v_problems, 'effective_date is in the future'); end if;
      exception when others then
        v_problems := array_append(v_problems, format('effective_date "%s" is not a date', r->>'effective_date'));
      end;
    end if;

    if array_length(v_problems, 1) is not null then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'number', v_number, 'problems',
        to_jsonb(v_problems));
    end if;

    -- Historical duplicates are PRESERVED, never fixed — but the report names them.
    if v_number is not null then
      if v_number = any(v_seen) then
        v_dupes_infile := array_append(v_dupes_infile, v_number);
      elsif exists (select 1 from public.documents
                    where tenant_id = v_ctx.tenant_id and document_number = v_number) then
        v_dupes_existing := array_append(v_dupes_existing, v_number);
      end if;
      v_seen := array_append(v_seen, v_number);
    end if;
  end loop;

  if not p_dry_run and jsonb_array_length(v_errors) > 0 then
    raise exception 'import_legacy_library: % row(s) failed validation — run the dry run for the report',
      jsonb_array_length(v_errors);
  end if;

  -- Pass 2 — import (commit mode only; every row already proven valid).
  if not p_dry_run then
    for r in select * from jsonb_array_elements(p_rows) loop
      select id into v_dept from public.departments
        where tenant_id = v_ctx.tenant_id
          and (upper(coalesce(code,'')) = upper(trim(r->>'department'))
               or lower(name) = lower(trim(r->>'department')))
        limit 1;
      v_owner := null;
      if nullif(trim(coalesce(r->>'owner_email','')), '') is not null then
        select id into v_owner from public.users
          where tenant_id = v_ctx.tenant_id and lower(email) = lower(trim(r->>'owner_email')) limit 1;
      end if;
      perform app.import_legacy_document(
        v_ctx.tenant_id, v_ctx.org_id, v_dept,
        trim(r->>'title'), trim(r->>'number'),
        coalesce(v_owner, v_caller), v_caller,
        coalesce(nullif(trim(coalesce(r->>'effective_date','')), '')::timestamptz, now()));
      v_ok := v_ok + 1;
    end loop;
    perform app.write_audit('library.imported', v_caller, null, v_ctx.tenant_id, v_ctx.org_id, null,
      'library', v_ctx.tenant_id::text, null,
      jsonb_build_object('rows', v_ok,
        'duplicates_preserved', to_jsonb(v_dupes_existing || v_dupes_infile)),
      null, 'D-LEGACY-IMPORT');
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'total', jsonb_array_length(p_rows),
    'importable', jsonb_array_length(p_rows) - jsonb_array_length(v_errors),
    'imported', v_ok,
    'errors', v_errors,
    'duplicate_numbers_existing', to_jsonb(v_dupes_existing),
    'duplicate_numbers_in_file', to_jsonb(v_dupes_infile));
end; $$;
revoke all on function public.import_legacy_library(jsonb, boolean) from public;
grant execute on function public.import_legacy_library(jsonb, boolean) to authenticated, service_role;
