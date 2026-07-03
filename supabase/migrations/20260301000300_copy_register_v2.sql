-- ============================================================================
-- Controlled-copy register v2 — the set-in-stone pass.
--
-- P9 gave the register its skeleton (issue/reconcile + the reconciliation and
-- retirement gates). This closes what a real GxP register needs and what the
-- skeleton left loose:
--
--   1. Copy numbers were max()+1 with no constraint — two concurrent issues
--      could mint the same number. Now: unique per version + allocation under
--      the version row lock.
--   2. Copies could be issued against ANY version (draft, superseded…). Only
--      effective versions are distributable now.
--   3. Plug-in/plug-out was half-real: the module switch gated nothing on the
--      write path. Now: module off → no NEW copies can be issued. Reconciling
--      stays possible regardless — switching a module off must never orphan
--      outstanding paper (fail-closed for data that exists; the reconciliation
--      and retirement gates already count register rows unconditionally).
--   4. The register itself now carries accountability: who issued, why
--      (purpose), who reconciled, and a note. Auditors read the register, not
--      the audit trail.
--   5. Reconciliation methods are a vocabulary, not free text: returned /
--      destroyed / lost — and "lost" demands a documented note (the
--      deviation-style record).
--   6. Recall surface: when a version supersedes or its document retires, its
--      issued copies become due for recall — a view the UI can worklist.
--   7. The change-pipe reconciliation gate said "% copies outstanding" without
--      saying WHICH — outstanding_copies_for_cc() lists them.
-- ============================================================================

-- Register accountability columns.
alter table public.controlled_copies add column if not exists issued_by uuid;
alter table public.controlled_copies add column if not exists purpose text;
alter table public.controlled_copies add column if not exists reconciled_by uuid;
alter table public.controlled_copies add column if not exists reconciled_note text;

-- Method vocabulary (rows only ever came from the RPCs, which sent
-- returned/destroyed, so this validates cleanly).
alter table public.controlled_copies drop constraint if exists copies_method_check;
alter table public.controlled_copies add constraint copies_method_check
  check (reconciled_method is null or reconciled_method in ('returned','destroyed','lost'));

-- Copy numbers are unique per version — the DB guarantees it, not just the RPC.
create unique index if not exists copies_version_number_unique
  on public.controlled_copies (document_version_id, copy_number);

-- issue v2: QA only, module ON, EFFECTIVE version only; allocation serialized
-- by the version row lock; issuer + purpose recorded on the register.
drop function if exists public.issue_controlled_copy(uuid, text);
create or replace function public.issue_controlled_copy(p_version uuid, p_holder text, p_purpose text default null)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v public.document_versions; v_num int; v_id uuid; v_caller uuid := auth.uid(); begin
  select * into v from public.document_versions where id = p_version for update;
  if v.id is null then raise exception 'issue_controlled_copy: no such version'; end if;
  if not app.is_qa(v_caller) then raise exception 'issue_controlled_copy: QA only'; end if;
  if not app.module_enabled(v.tenant_id, 'controlled_copies') then
    raise exception 'issue_controlled_copy: the controlled-copy register module is off'; end if;
  if v.status <> 'effective' then
    raise exception 'issue_controlled_copy: only the EFFECTIVE version may be distributed (is %)', v.status; end if;
  if length(trim(coalesce(p_holder,''))) = 0 then
    raise exception 'issue_controlled_copy: a holder is required'; end if;
  select coalesce(max(copy_number),0)+1 into v_num from public.controlled_copies where document_version_id=p_version;
  insert into public.controlled_copies(tenant_id, document_version_id, copy_number, holder, issued_by, purpose)
    values (v.tenant_id, p_version, v_num, trim(p_holder), v_caller, nullif(trim(coalesce(p_purpose,'')),''))
    returning id into v_id;
  perform app.write_audit('copy.issued', v_caller, null, v.tenant_id, v.org_id, v.department_id,
    'controlled_copy', v_id::text, null,
    jsonb_build_object('copy_number', v_num, 'holder', trim(p_holder), 'purpose', p_purpose), null, 'D-COPIES');
  return v_id;
end; $$;

-- reconcile v2: method from the vocabulary, "lost" requires a note, the
-- reconciler lands on the register. Works with the module off — accounting for
-- an existing copy is always possible.
drop function if exists public.reconcile_copy(uuid, text);
create or replace function public.reconcile_copy(p_copy uuid, p_method text, p_note text default null)
returns void language plpgsql security definer set search_path = app, public as $$
declare cp public.controlled_copies; v public.document_versions; v_caller uuid := auth.uid(); begin
  select * into cp from public.controlled_copies where id=p_copy for update;
  if cp.id is null then raise exception 'reconcile_copy: no such copy'; end if;
  if not app.is_qa(v_caller) then raise exception 'reconcile_copy: QA only'; end if;
  if cp.status <> 'issued' then raise exception 'reconcile_copy: already reconciled'; end if;
  if p_method not in ('returned','destroyed','lost') then
    raise exception 'reconcile_copy: method must be returned, destroyed or lost'; end if;
  if p_method = 'lost' and length(trim(coalesce(p_note,''))) = 0 then
    raise exception 'reconcile_copy: a lost copy must be documented — add a note'; end if;
  select * into v from public.document_versions where id = cp.document_version_id;
  update public.controlled_copies
    set status='reconciled', reconciled_at=now(), reconciled_method=p_method,
        reconciled_by=v_caller, reconciled_note=nullif(trim(coalesce(p_note,'')),'')
    where id=p_copy;
  perform app.write_audit('copy.reconciled', v_caller, null, cp.tenant_id, v.org_id, v.department_id,
    'controlled_copy', p_copy::text, jsonb_build_object('status','issued'),
    jsonb_build_object('status','reconciled','method',p_method,'note',p_note), null, 'D-COPIES');
end; $$;

-- Recall surface: issued copies whose version is no longer the effective one
-- (superseded/retained/destroyed) or whose document has retired. Invoker
-- rights → the underlying RLS applies unchanged.
create or replace view public.copies_recall_due
with (security_invoker = true) as
  select cp.id, cp.tenant_id, cp.document_version_id, cp.copy_number, cp.holder,
         cp.purpose, cp.issued_at, dv.status as version_status,
         d.id as document_id, d.document_number, d.title, d.status as document_status
  from public.controlled_copies cp
  join public.document_versions dv on dv.id = cp.document_version_id
  join public.documents d on d.id = dv.document_id
  where cp.status = 'issued' and (dv.status <> 'effective' or d.status = 'retired');
grant select on public.copies_recall_due to authenticated;

-- The reconciliation gate's worklist: exactly the copies reconcile_cc counts,
-- with enough identity to chase them (invoker rights → tenant RLS applies).
create or replace function public.outstanding_copies_for_cc(p_cc uuid)
returns table (copy_id uuid, copy_number int, holder text, purpose text,
               issued_at timestamptz, document_number text, title text)
language sql stable security invoker set search_path = public as $$
  select cp.id, cp.copy_number, cp.holder, cp.purpose, cp.issued_at, d.document_number, d.title
  from public.change_control_documents ccd
  join public.document_versions dv on dv.document_id = ccd.document_id and dv.status='effective'
  join public.controlled_copies cp on cp.document_version_id = dv.id and cp.status='issued'
  join public.documents d on d.id = ccd.document_id
  where ccd.change_control_id = p_cc
  order by d.document_number, cp.copy_number;
$$;

do $$ declare fn text; begin
  foreach fn in array array['issue_controlled_copy(uuid,text,text)','reconcile_copy(uuid,text,text)',
    'outstanding_copies_for_cc(uuid)']
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
