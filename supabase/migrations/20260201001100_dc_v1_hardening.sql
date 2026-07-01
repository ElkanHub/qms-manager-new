-- ============================================================================
-- Document-Control V1 hardening — closes the gaps the scope-freeze checklist
-- run surfaced. Shipped migrations stay untouched (append-only); the affected
-- functions are replaced here.
--   1. SoD at signature application: the change requester can no longer sign a
--      required slot on their own change, even if they hold the slot's role.
--   2. Impact hard gate checks substance, not just key presence: a blank value
--      no longer counts as a completed assessment.
--   3. Retirement pre-check gains a real copies gate: outstanding (issued,
--      unreconciled) controlled copies block approval. Replaces the
--      filing_clear placeholder, which was hardcoded true.
--   4. Feedback path: audited in-app "flag this" for QA (feedback.flagged on
--      the tenant chain — the audit trail is the store, so it is append-only
--      and attributable like everything else).
--   5. Usage visibility: screen-usage and flow-abandonment summary derived
--      from existing audit data (QA / org-admin only).
--   6. Audit story: one document's complete journey across every entity that
--      touched it (document, versions, changes, retirement, copies), in
--      chain order, for the inspector-facing export.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (2) Impact completeness: every required key present AND non-blank. Booleans
-- serialize as 'true'/'false' so they pass; null or '' no longer does.
-- ---------------------------------------------------------------------------
create or replace function app.impact_complete(p_impact jsonb) returns boolean
language sql immutable as $$
  select p_impact is not null and (
    select bool_and(coalesce(length(trim(p_impact ->> k)), 0) > 0)
    from unnest(array['documents_affected','training_required','templates_affected',
                      'systems_touched','revalidation_needed','regulatory_notification']) k);
$$;

-- ---------------------------------------------------------------------------
-- (1) apply_signature — same flow as dc_p7, plus the shared SoD primitive:
-- signer ≠ requester. QA review already carries SoD vs the requester; this
-- closes the remaining hole where a requester holding hod/qa/signatory could
-- satisfy a required slot on their own change.
-- ---------------------------------------------------------------------------
create or replace function public.apply_signature(p_cc uuid, p_meaning text)
returns void language plpgsql security definer set search_path = app, public as $$
declare c public.change_controls; v_caller uuid := auth.uid(); v_role text;
begin
  select * into c from public.change_controls where id=p_cc for update;
  if c.status <> 'signatures_pending' then raise exception 'apply_signature: not awaiting signatures'; end if;
  perform app.enforce_sod(v_caller, c.requester_id, 'apply_signature');
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

-- ---------------------------------------------------------------------------
-- (3) Retirement pre-checks — the copies gate is now real: any issued,
-- unreconciled controlled copy of any version of the document blocks approval.
-- Safe default holds: with the register off nothing can be issued, so the
-- check is vacuously true. filing_clear (a hardcoded placeholder) is gone.
-- ---------------------------------------------------------------------------
create or replace function app.retirement_prechecks(p_document uuid) returns jsonb
language plpgsql stable security definer set search_path = app, public as $$
declare v_effective boolean; v_no_change boolean; v_training boolean := true; v_copies boolean; v_row jsonb;
begin
  select exists(select 1 from public.document_versions where document_id=p_document and status='effective') into v_effective;
  select not exists(
    select 1 from public.change_control_documents ccd
    join public.change_controls c on c.id=ccd.change_control_id
    where ccd.document_id=p_document and c.status not in ('closed','rejected')
  ) into v_no_change;
  if to_regclass('public.training_assignments') is not null then
    execute 'select not exists(select 1 from public.training_assignments where document_id=$1 and status<>''completed'')'
      into v_training using p_document;
  end if;
  select not exists(
    select 1 from public.controlled_copies cc
    join public.document_versions dv on dv.id = cc.document_version_id
    where dv.document_id = p_document and cc.status = 'issued'
  ) into v_copies;
  v_row := jsonb_build_object('has_effective', v_effective, 'no_open_change', v_no_change,
    'training_closed', v_training, 'copies_reconciled', v_copies);
  return v_row || jsonb_build_object('all_ok', v_effective and v_no_change and v_training and v_copies);
end; $$;

-- ---------------------------------------------------------------------------
-- (4) flag_feedback — the one in-app "flag this" path. Writes through the
-- audit primitive on the tenant chain, so feedback is append-only, hash-chained
-- and attributable, and needs no new table or policies.
-- ---------------------------------------------------------------------------
create or replace function public.flag_feedback(p_message text, p_context text default null)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); u public.users;
begin
  if v_caller is null then raise exception 'flag_feedback: sign in required'; end if;
  if p_message is null or length(trim(p_message)) = 0 then raise exception 'flag_feedback: message required'; end if;
  select * into u from public.users where id = v_caller;
  if u.id is null or u.tenant_id is null then raise exception 'flag_feedback: org user required'; end if;
  perform app.write_audit('feedback.flagged', v_caller, u.email, u.tenant_id, u.org_id, u.department_id,
    'feedback', null, null, jsonb_build_object('context', p_context), p_message,
    coalesce(nullif(trim(p_context), ''), 'S-FEEDBACK'));
end; $$;
grant execute on function public.flag_feedback(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- (5) usage_summary — screen-usage and flow-abandonment from the audit trail
-- (no new instrumentation; the audit substrate already records screen sources).
-- QA / org-admin only; scoped to the caller's tenant.
-- ---------------------------------------------------------------------------
create or replace function public.usage_summary(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_tenant uuid := public.current_tenant_id();
        v_since timestamptz; v_screens jsonb; v_funnel jsonb;
begin
  if v_tenant is null then raise exception 'usage_summary: org session required'; end if;
  if not (app.is_qa(v_caller) or app.has_role(v_caller, 'org_admin')) then
    raise exception 'usage_summary: QA or org admin only';
  end if;
  v_since := now() - make_interval(days => greatest(coalesce(p_days, 30), 1));

  select coalesce(jsonb_agg(jsonb_build_object('screen', source, 'actions', n)), '[]'::jsonb)
    into v_screens
    from (select coalesce(source, '(none)') as source, count(*) as n
          from public.audit_trail
          where tenant_id = v_tenant and occurred_at >= v_since
          group by 1 order by 2 desc limit 20) s;

  select jsonb_build_object(
    'intakes_started',    count(*) filter (where action = 'intake.started'),
    'intakes_dispatched', count(*) filter (where action = 'intake.dispatched'),
    'intakes_disputed',   count(*) filter (where action = 'intake.disputed'),
    'drafts_created',     count(*) filter (where action = 'document.created'),
    'drafts_submitted',   count(*) filter (where action = 'document.submitted'),
    'changes_opened',     count(*) filter (where action = 'change.created'),
    'changes_closed',     count(*) filter (where action = 'change.closed'),
    'feedback_flags',     count(*) filter (where action = 'feedback.flagged'))
    into v_funnel
    from public.audit_trail
    where tenant_id = v_tenant and occurred_at >= v_since;

  return jsonb_build_object('window_days', greatest(coalesce(p_days, 30), 1),
                            'screens', v_screens, 'funnel', v_funnel);
end; $$;
grant execute on function public.usage_summary(int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- (6) document_story — the complete, chronological, attributable journey of
-- one document: its own entries plus those of its versions, change controls,
-- retirement records and controlled copies. Tenant-scoped exactly like the
-- audit_org_read RLS policy (the definer only widens across entity ids, never
-- across tenants).
-- ---------------------------------------------------------------------------
create or replace function public.document_story(p_document uuid)
returns setof public.audit_trail
language plpgsql stable security definer set search_path = app, public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.documents where id = p_document;
  if v_tenant is null or v_tenant is distinct from public.current_tenant_id() then
    raise exception 'document_story: no such document in your tenant';
  end if;
  return query
    select a.* from public.audit_trail a
    where a.tenant_id = v_tenant and (
      (a.entity_type = 'document' and a.entity_id = p_document::text)
      or (a.entity_type = 'document_version' and a.entity_id in
            (select v.id::text from public.document_versions v where v.document_id = p_document))
      or (a.entity_type = 'change_control' and a.entity_id in
            (select ccd.change_control_id::text from public.change_control_documents ccd
             where ccd.document_id = p_document))
      or (a.entity_type = 'retirement' and a.entity_id in
            (select r.id::text from public.retirements r where r.document_id = p_document))
      or (a.entity_type = 'controlled_copy' and a.entity_id in
            (select cc.id::text from public.controlled_copies cc
             join public.document_versions dv on dv.id = cc.document_version_id
             where dv.document_id = p_document)))
    order by a.id;
end; $$;
grant execute on function public.document_story(uuid) to authenticated, service_role;
