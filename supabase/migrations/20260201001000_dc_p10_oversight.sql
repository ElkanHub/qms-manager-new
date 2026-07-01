-- ============================================================================
-- Document-Control Phase 10 — Periodic review, dashboards & oversight
-- The core ALWAYS stores each effective document's next-review date (so manual
-- review is always possible); the periodic-review MODULE, when on, proactively
-- surfaces due/overdue items (safe default when off: dates stored, not surfaced).
-- Concluding a review with "revise" raises a change request into the change pipe.
-- Dashboards and audit viewing reuse existing queries + the foundation's S-AUDIT.
-- ============================================================================

insert into public.modules (key, label, description, audit_compliant) values
  ('periodic_review', 'Periodic Review', 'Surfaces documents due/overdue for periodic review.', true)
on conflict (key) do nothing;

-- Core stores the next-review date on every document (not module-gated).
alter table public.documents add column if not exists next_review_at timestamptz;

create or replace function app.review_cadence_months(p_tenant uuid) returns int
language sql stable security definer set search_path = app, public as $$
  select coalesce((select (config->>'months')::int from public.tenant_modules
          where tenant_id=p_tenant and module_key='periodic_review'), 24);
$$;

-- Re-affirm make_effective (P1→P2→here): atomic supersession + rendition lock +
-- now stamps the next-review date from the tenant cadence.
create or replace function app.make_effective(
  p_version uuid, p_actor uuid, p_effective_from timestamptz default now(), p_source text default null)
returns int
language plpgsql security definer set search_path = app, public as $$
declare v public.document_versions; v_prev public.document_versions; v_rev int;
begin
  select * into v from public.document_versions where id = p_version for update;
  if v.id is null then raise exception 'make_effective: no such version'; end if;
  if v.status <> 'approved' then raise exception 'make_effective: version must be approved (is %)', v.status; end if;

  select * into v_prev from public.document_versions
    where document_id = v.document_id and status = 'effective' for update;
  if v_prev.id is not null then
    update public.document_versions set status='superseded', superseded_at=p_effective_from where id=v_prev.id;
    perform app.write_audit('version.superseded', p_actor, null, v_prev.tenant_id, v_prev.org_id, v_prev.department_id,
      'document_version', v_prev.id::text, jsonb_build_object('status','effective'),
      jsonb_build_object('status','superseded'), null, p_source);
  end if;

  select coalesce(max(revision_number), -1) + 1 into v_rev
    from public.document_versions where document_id = v.document_id;
  update public.document_versions
    set status='effective', effective_from=p_effective_from, revision_number=v_rev,
        rendition_ref=coalesce(rendition_ref, content_ref)
    where id = v.id;
  update public.documents
    set status='active', current_version_id=v.id,
        next_review_at = p_effective_from + make_interval(months => app.review_cadence_months(v.tenant_id)),
        updated_at=now()
    where id = v.document_id;

  perform app.write_audit('version.effective', p_actor, null, v.tenant_id, v.org_id, v.department_id,
    'document_version', v.id::text, jsonb_build_object('status','approved'),
    jsonb_build_object('status','effective','revision', v_rev), null, p_source);
  return v_rev;
end; $$;

-- Conclude a periodic review. "revise" raises a change request (into the change pipe);
-- "no_change" pushes the next-review date forward by the cadence. QA or the owner.
create or replace function public.conclude_periodic_review(p_document uuid, p_outcome text, p_reason text)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v_caller uuid := auth.uid(); v_cc uuid;
begin
  select * into d from public.documents where id=p_document for update;
  if d.id is null then raise exception 'conclude_periodic_review: no such document'; end if;
  if not (app.is_qa(v_caller) or d.owner_id = v_caller) then raise exception 'conclude_periodic_review: QA or owner only'; end if;
  if p_outcome not in ('revise','no_change') then raise exception 'conclude_periodic_review: outcome must be revise|no_change'; end if;

  if p_outcome = 'revise' then
    v_cc := public.create_change(array[p_document], coalesce(p_reason,'periodic review: revision required'));
  else
    update public.documents
      set next_review_at = now() + make_interval(months => app.review_cadence_months(d.tenant_id))
      where id=p_document;
  end if;
  perform app.write_audit('review.concluded', v_caller, null, d.tenant_id, d.org_id, d.department_id,
    'document', p_document::text, null, jsonb_build_object('outcome', p_outcome, 'change_control', v_cc), p_reason, 'D-PERIODIC');
  return v_cc;
end; $$;

revoke all on function public.conclude_periodic_review(uuid,text,text) from public;
grant execute on function public.conclude_periodic_review(uuid,text,text) to authenticated, service_role;
grant execute on function app.review_cadence_months(uuid) to authenticated, service_role;
