-- ============================================================================
-- Document-Control Phase 9 — Coupling modules (training + controlled-copy register)
-- Both attach through the seam contract with a safe default so the core flow never
-- breaks when off. Training couples at the effective window (Phases 6/7); the copy
-- register couples at reconciliation (Phase 7). Both are switchboard-controlled and
-- audited. A module that doesn't write audit is not connectable (foundation rule).
-- ============================================================================

insert into public.modules (key, label, description, audit_compliant) values
  ('controlled_copies', 'Controlled-Copy Register', 'Issue/track physical controlled copies; feeds reconciliation.', true)
on conflict (key) do nothing;
-- 'training' is already registered by the foundation.

-- ---- Training / LMS ----
create table if not exists public.training_assignments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  org_id       uuid not null references public.organizations(id),
  document_id  uuid not null references public.documents(id),
  user_id      uuid not null references public.users(id),
  status       text not null default 'assigned' check (status in ('assigned','completed')),
  assigned_by  uuid,
  assigned_at  timestamptz not null default now(),
  completed_at timestamptz,
  unique (document_id, user_id)
);
alter table public.training_assignments enable row level security;
alter table public.training_assignments force row level security;
drop policy if exists training_read on public.training_assignments;
create policy training_read on public.training_assignments for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.training_assignments to authenticated;

-- ---- Controlled-copy register (§10.6) ----
create table if not exists public.controlled_copies (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id),
  document_version_id uuid not null references public.document_versions(id),
  copy_number         int not null,
  holder              text not null,
  issued_at           timestamptz not null default now(),
  status              text not null default 'issued' check (status in ('issued','reconciled')),
  reconciled_at       timestamptz,
  reconciled_method   text
);
create index if not exists copies_version_idx on public.controlled_copies (document_version_id, status);
alter table public.controlled_copies enable row level security;
alter table public.controlled_copies force row level security;
drop policy if exists copies_read on public.controlled_copies;
create policy copies_read on public.controlled_copies for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.controlled_copies to authenticated;

-- ---------------------------------------------------------------------------
-- Training threshold (real completion data). Safe default: no assignments → met.
-- Threshold % from the module config (default 100).
-- ---------------------------------------------------------------------------
create or replace function app.document_training_met(p_tenant uuid, p_document uuid) returns boolean
language sql stable security definer set search_path = app, public as $$
  with a as (select count(*) total, count(*) filter (where status='completed') done
             from public.training_assignments where document_id = p_document),
       thr as (select coalesce((select (config->>'threshold')::numeric from public.tenant_modules
               where tenant_id=p_tenant and module_key='training'), 100) t)
  select case when (select total from a) = 0 then true
              else (select done from a) * 100.0 / (select total from a) >= (select t from thr) end;
$$;
grant execute on function app.document_training_met(uuid,uuid) to authenticated, service_role;

-- assign / complete training (trainer or QA).
create or replace function public.assign_training(p_document uuid, p_user uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v_caller uuid := auth.uid(); begin
  select * into d from public.documents where id=p_document;
  if not (app.is_qa(v_caller) or app.has_role(v_caller,'trainer')) then raise exception 'assign_training: QA/trainer only'; end if;
  insert into public.training_assignments(tenant_id, org_id, document_id, user_id, assigned_by)
    values (d.tenant_id, d.org_id, p_document, p_user, v_caller) on conflict (document_id,user_id) do nothing;
  perform app.write_audit('training.assigned', v_caller, null, d.tenant_id, d.org_id, d.department_id,
    'training_assignment', p_document::text, null, jsonb_build_object('user', p_user), null, 'D-TRAINING');
end; $$;

create or replace function public.complete_training(p_assignment uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare a public.training_assignments; v_caller uuid := auth.uid(); begin
  select * into a from public.training_assignments where id=p_assignment for update;
  if a.id is null then raise exception 'complete_training: no such assignment'; end if;
  if not (a.user_id = v_caller or app.is_qa(v_caller) or app.has_role(v_caller,'trainer')) then
    raise exception 'complete_training: the trainee, trainer, or QA only'; end if;
  update public.training_assignments set status='completed', completed_at=now() where id=p_assignment;
  perform app.write_audit('training.completed', v_caller, null, a.tenant_id, a.org_id, null,
    'training_assignment', p_assignment::text, jsonb_build_object('status','assigned'),
    jsonb_build_object('status','completed'), null, 'D-TRAINING');
end; $$;

-- Make the training release gate REAL: when the module is on, the per-document
-- threshold must be met before release (safe default when off — unchanged).
create or replace function public.release_training(p_document uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v public.document_versions; v_caller uuid := auth.uid();
begin
  select * into d from public.documents where id = p_document for update;
  if d.status <> 'pending_training' then raise exception 'release_training: document is not pending training'; end if;
  if not (app.is_qa(v_caller) or app.has_role(v_caller,'trainer')) then raise exception 'release_training: QA/trainer only'; end if;
  if app.module_enabled(d.tenant_id,'training') and not app.document_training_met(d.tenant_id, p_document) then
    raise exception 'release_training: training threshold not met (untrained users would be blocked from execution)';
  end if;
  select * into v from public.document_versions where document_id=p_document and status='approved' order by created_at desc limit 1;
  perform app.make_effective(v.id, v_caller, now(), 'D-TRAINING');
  perform app.write_audit('training.released', v_caller, null, d.tenant_id, d.org_id, d.department_id,
    'document', p_document::text, jsonb_build_object('status','pending_training'), jsonb_build_object('status','active'),
    null, 'D-TRAINING');
end; $$;

-- ---- Controlled-copy register RPCs ----
create or replace function public.issue_controlled_copy(p_version uuid, p_holder text)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v public.document_versions; v_num int; v_id uuid; begin
  select * into v from public.document_versions where id=p_version;
  if v.id is null then raise exception 'issue_controlled_copy: no such version'; end if;
  if not app.is_qa(auth.uid()) then raise exception 'issue_controlled_copy: QA only'; end if;
  select coalesce(max(copy_number),0)+1 into v_num from public.controlled_copies where document_version_id=p_version;
  insert into public.controlled_copies(tenant_id, document_version_id, copy_number, holder)
    values (v.tenant_id, p_version, v_num, p_holder) returning id into v_id;
  perform app.write_audit('copy.issued', auth.uid(), null, v.tenant_id, v.org_id, v.department_id,
    'controlled_copy', v_id::text, null, jsonb_build_object('copy_number', v_num, 'holder', p_holder), null, 'D-COPIES');
  return v_id;
end; $$;

create or replace function public.reconcile_copy(p_copy uuid, p_method text)
returns void language plpgsql security definer set search_path = app, public as $$
declare cp public.controlled_copies; begin
  select * into cp from public.controlled_copies where id=p_copy for update;
  if cp.id is null then raise exception 'reconcile_copy: no such copy'; end if;
  if not app.is_qa(auth.uid()) then raise exception 'reconcile_copy: QA only'; end if;
  update public.controlled_copies set status='reconciled', reconciled_at=now(), reconciled_method=p_method where id=p_copy;
  perform app.write_audit('copy.reconciled', auth.uid(), null, cp.tenant_id, null, null,
    'controlled_copy', p_copy::text, jsonb_build_object('status','issued'),
    jsonb_build_object('status','reconciled','method',p_method), null, 'D-COPIES');
end; $$;

do $$ declare fn text; begin
  foreach fn in array array['assign_training(uuid,uuid)','complete_training(uuid)','release_training(uuid)',
    'issue_controlled_copy(uuid,text)','reconcile_copy(uuid,text)']
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
