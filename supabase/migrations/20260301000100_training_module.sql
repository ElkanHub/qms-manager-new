-- ============================================================================
-- Training Module — T0/T1: data model, seam wiring, human gate, assessment,
-- certificates (TRAINING_MODULE_BUILD_PLAN §2, §4, §9).
--
-- A MODULE, not core: registered on the switchboard ('training', already in the
-- registry), attached through seam B. Module off → the core's safe default
-- (no training gate) — unchanged. Nothing here weakens a core guard.
--
-- Replaces the P9 mock internals with the real module while preserving the P9
-- surface (assign_training/complete_training/release_training keep working for
-- document-level legacy assignments; document_training_met becomes
-- package-aware). The seam contract:
--   is_training_required(version)  → app.is_training_required
--   is_threshold_met(version)      → app.document_training_met (package-aware)
--   is_user_trained(user, version) → app.is_user_trained (feeds the core's
--     execution-block guard; the core has no execution RPC yet, so the guard is
--     exposed as app.enforce_trained_for_execution for the first execution
--     feature to call, and surfaced in the UI meanwhile)
--
-- Non-negotiables built in (plan §1, §11): AI output is a DRAFT until a human
-- trainer approves (unapproved content is unassignable); training is
-- version-specific; attempts are append-only; grading is server-side (correct
-- answers never leave the database); every action writes the audit spine.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Roles/guards
-- ---------------------------------------------------------------------------
create or replace function app.is_trainer(p_user uuid) returns boolean
language sql stable security definer set search_path = app, public as $$
  select app.is_qa(p_user) or app.has_role(p_user, 'trainer');
$$;
grant execute on function app.is_trainer(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- QA-owned module settings (plan §11: pass mark, retakes, due-date default).
-- Threshold % stays in tenant_modules.config (platform switchboard) as built.
-- ---------------------------------------------------------------------------
create table if not exists public.training_settings (
  tenant_id        uuid primary key references public.tenants(id),
  pass_mark        int  not null default 80 check (pass_mark between 1 and 100),
  max_attempts     int  check (max_attempts is null or max_attempts >= 1),  -- null = unlimited
  default_due_days int  not null default 14 check (default_due_days between 1 and 365),
  updated_by       uuid,
  updated_at       timestamptz not null default now()
);
alter table public.training_settings enable row level security;
alter table public.training_settings force row level security;
drop policy if exists training_settings_read on public.training_settings;
create policy training_settings_read on public.training_settings for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.training_settings to authenticated;

create or replace function public.set_training_settings(
  p_pass_mark int, p_max_attempts int default null, p_default_due_days int default 14)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_tenant uuid := public.current_tenant_id(); u public.users;
begin
  if not app.is_qa(v_caller) then raise exception 'set_training_settings: QA only'; end if;
  select * into u from public.users where id = v_caller;
  insert into public.training_settings(tenant_id, pass_mark, max_attempts, default_due_days, updated_by)
    values (v_tenant, p_pass_mark, p_max_attempts, p_default_due_days, v_caller)
  on conflict (tenant_id) do update
    set pass_mark = excluded.pass_mark, max_attempts = excluded.max_attempts,
        default_due_days = excluded.default_due_days, updated_by = excluded.updated_by, updated_at = now();
  perform app.write_audit('training.settings_set', v_caller, null, v_tenant, u.org_id, null,
    'training_settings', v_tenant::text, null,
    jsonb_build_object('pass_mark', p_pass_mark, 'max_attempts', p_max_attempts,
                       'default_due_days', p_default_due_days), null, 'T-PACKAGES');
end; $$;
grant execute on function public.set_training_settings(int,int,int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tenant branding (plan §5). Logo + name now; color fields exist but stay null
-- until onboarding collects them — the module reads whatever is here and falls
-- back to a neutral palette.
-- ---------------------------------------------------------------------------
create table if not exists public.tenant_branding (
  tenant_id        uuid primary key references public.tenants(id),
  org_display_name text,
  logo_ref         text,
  color_primary    text,   -- collected at onboarding (schema ready now)
  color_secondary  text,
  color_accent     text,
  updated_by       uuid,
  updated_at       timestamptz not null default now()
);
alter table public.tenant_branding enable row level security;
alter table public.tenant_branding force row level security;
drop policy if exists tenant_branding_read on public.tenant_branding;
create policy tenant_branding_read on public.tenant_branding for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.tenant_branding to authenticated;

create or replace function public.set_tenant_branding(
  p_display_name text, p_logo_ref text default null,
  p_color_primary text default null, p_color_secondary text default null, p_color_accent text default null)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_tenant uuid := public.current_tenant_id(); u public.users;
begin
  if not (app.is_qa(v_caller) or app.has_role(v_caller, 'org_admin')) then
    raise exception 'set_tenant_branding: QA or org admin only'; end if;
  select * into u from public.users where id = v_caller;
  insert into public.tenant_branding(tenant_id, org_display_name, logo_ref,
      color_primary, color_secondary, color_accent, updated_by)
    values (v_tenant, p_display_name, p_logo_ref, p_color_primary, p_color_secondary, p_color_accent, v_caller)
  on conflict (tenant_id) do update
    set org_display_name = excluded.org_display_name, logo_ref = excluded.logo_ref,
        color_primary = excluded.color_primary, color_secondary = excluded.color_secondary,
        color_accent = excluded.color_accent, updated_by = excluded.updated_by, updated_at = now();
  perform app.write_audit('branding.set', v_caller, null, v_tenant, u.org_id, null,
    'tenant_branding', v_tenant::text, null,
    jsonb_build_object('display_name', p_display_name, 'logo', p_logo_ref is not null,
                       'colors_set', p_color_primary is not null), null, 'T-BRANDING');
end; $$;
grant execute on function public.set_tenant_branding(text,text,text,text,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- AI Gateway (plan §3): platform-level provider config + append-only call log.
-- The gateway service (TypeScript) reads the config, calls the provider, and
-- records provenance through log_ai_call. No module talks to a provider
-- directly; no API key is ever stored in the database (env-injected).
-- ---------------------------------------------------------------------------
create table if not exists public.ai_gateway_config (
  id        boolean primary key default true check (id),  -- single row
  provider  text not null default 'gemini',
  model     text not null default 'gemini-2.5-flash',
  settings  jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.ai_gateway_config (id) values (true) on conflict do nothing;
alter table public.ai_gateway_config enable row level security;
alter table public.ai_gateway_config force row level security;
-- Config is not secret (provider + model name); readable by signed-in users so
-- trainer screens can show provenance targets. Writable by platform only.
drop policy if exists ai_gateway_config_read on public.ai_gateway_config;
create policy ai_gateway_config_read on public.ai_gateway_config for select to authenticated
  using (true);
grant select on public.ai_gateway_config to authenticated;

create or replace function public.set_ai_gateway_config(p_provider text, p_model text, p_settings jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid();
begin
  if not app.has_platform_scope(v_caller, 'switchboard') then
    raise exception 'set_ai_gateway_config: platform (switchboard scope) only'; end if;
  update public.ai_gateway_config
    set provider = p_provider, model = p_model, settings = coalesce(p_settings, '{}'::jsonb),
        updated_by = v_caller, updated_at = now()
    where id;
  perform app.write_audit('ai.gateway_config_set', v_caller, null, null, null, null,
    'ai_gateway_config', 'platform', null,
    jsonb_build_object('provider', p_provider, 'model', p_model), null, 'AI-GATEWAY-CONFIG');
end; $$;
grant execute on function public.set_ai_gateway_config(text,text,jsonb) to authenticated, service_role;

create table if not exists public.ai_gateway_log (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid references public.tenants(id),
  operation           text not null,           -- generate_slides | generate_questions | …
  provider            text not null,
  model_version       text not null,
  requested_by        uuid,
  document_version_id uuid references public.document_versions(id),
  package_id          uuid,
  status              text not null default 'success' check (status in ('success','error')),
  error               text,
  output_ref          text,                    -- pointer to what was produced (package id / counts)
  requested_at        timestamptz not null default now()
);
create index if not exists ai_log_tenant_idx on public.ai_gateway_log (tenant_id, requested_at);
alter table public.ai_gateway_log enable row level security;
alter table public.ai_gateway_log force row level security;
drop policy if exists ai_log_read on public.ai_gateway_log;
create policy ai_log_read on public.ai_gateway_log for select to authenticated
  using (tenant_id = public.current_tenant_id() and app.is_trainer(auth.uid()));
grant select on public.ai_gateway_log to authenticated;

-- Append-only: provenance is never rewritten.
create or replace function app.ai_log_guard() returns trigger
language plpgsql as $$
begin
  raise exception 'ai_gateway_log is append-only: % is not permitted', tg_op;
end; $$;
drop trigger if exists ai_log_guard_rows on public.ai_gateway_log;
create trigger ai_log_guard_rows before update or delete on public.ai_gateway_log
  for each row execute function app.ai_log_guard();

-- ---------------------------------------------------------------------------
-- Training packages — version-specific (plan §1.2). One open package per
-- document version; content lives in slides/questions rows below.
-- ---------------------------------------------------------------------------
create table if not exists public.training_packages (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id),
  org_id              uuid not null references public.organizations(id),
  department_id       uuid references public.departments(id),
  document_id         uuid not null references public.documents(id),
  document_version_id uuid not null references public.document_versions(id),
  template_key        text not null check (template_key in
                        ('clean-corporate','visual-steps','compact-brief','detailed-walkthrough','change-summary')),
  question_count      int not null default 5 check (question_count between 3 and 25),
  pass_mark           int check (pass_mark is null or pass_mark between 1 and 100),  -- null → tenant setting
  state               text not null default 'generating'
                      check (state in ('generating','draft_review','approved','assigned','closed')),
  created_by          uuid not null,
  created_at          timestamptz not null default now(),
  approved_by         uuid,
  approved_at         timestamptz,
  closed_at           timestamptz,
  close_reason        text
);
-- One open (non-closed) package per document version.
create unique index if not exists one_open_package_per_version
  on public.training_packages (document_version_id) where state <> 'closed';
create index if not exists packages_document_idx on public.training_packages (document_id, state);
alter table public.training_packages enable row level security;
alter table public.training_packages force row level security;
drop policy if exists packages_read on public.training_packages;
create policy packages_read on public.training_packages for select to authenticated
  using (tenant_id = public.current_tenant_id() and app.is_trainer(auth.uid()));
grant select on public.training_packages to authenticated;

-- Slides. `body` is the approved text; `ai_draft` preserves what the AI
-- produced (provenance: AI draft vs approved version distinguishable — §1.1).
create table if not exists public.training_slides (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id),
  package_id uuid not null references public.training_packages(id),
  position   int not null,
  title      text not null default '',
  body       text not null default '',
  ai_draft   jsonb,          -- {title, body} as generated; null for human-added slides
  edited_by  uuid,
  updated_at timestamptz not null default now()
);
create index if not exists slides_package_idx on public.training_slides (package_id, position);
alter table public.training_slides enable row level security;
alter table public.training_slides force row level security;
drop policy if exists slides_read on public.training_slides;
create policy slides_read on public.training_slides for select to authenticated
  using (tenant_id = public.current_tenant_id() and app.is_trainer(auth.uid()));
grant select on public.training_slides to authenticated;
-- (Trainees read slides through get_training_content — single audited door.)

-- Questions. correct_index/explanation are trainer-only: RLS restricts the
-- table to trainers, and trainees receive questions stripped of answers via
-- get_assessment. Grading happens server-side in submit_assessment.
create table if not exists public.training_questions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  package_id    uuid not null references public.training_packages(id),
  position      int not null,
  question      text not null default '',
  options       jsonb not null default '[]'::jsonb,
  correct_index int not null default 0,
  explanation   text,
  ai_draft      jsonb,        -- {question, options, correct_index} as generated
  edited_by     uuid,
  updated_at    timestamptz not null default now(),
  constraint question_options_shape check (jsonb_typeof(options) = 'array')
);
create index if not exists questions_package_idx on public.training_questions (package_id, position);
alter table public.training_questions enable row level security;
alter table public.training_questions force row level security;
drop policy if exists questions_read on public.training_questions;
create policy questions_read on public.training_questions for select to authenticated
  using (tenant_id = public.current_tenant_id() and app.is_trainer(auth.uid()));
grant select on public.training_questions to authenticated;

-- ---------------------------------------------------------------------------
-- Assignments — extend the P9 table for packages, due dates, progress and the
-- richer state set (plan §4.2; 'overdue' is DERIVED from due_at, never stored,
-- so tracking cannot drift — §8).
-- Re-training on a new version needs multiple assignments per (document,user):
-- the old blanket uniqueness gives way to per-package uniqueness, with the
-- legacy (package-less) shape keeping its old guarantee.
-- ---------------------------------------------------------------------------
alter table public.training_assignments add column if not exists package_id uuid references public.training_packages(id);
alter table public.training_assignments add column if not exists due_at timestamptz;
alter table public.training_assignments add column if not exists started_at timestamptz;
alter table public.training_assignments add column if not exists slide_progress_pct int not null default 0
  check (slide_progress_pct between 0 and 100);
alter table public.training_assignments drop constraint if exists training_assignments_status_check;
alter table public.training_assignments add constraint training_assignments_status_check
  check (status in ('assigned','in_progress','awaiting_assessment','completed'));
alter table public.training_assignments drop constraint if exists training_assignments_document_id_user_id_key;
create unique index if not exists one_assignment_per_package_user
  on public.training_assignments (package_id, user_id) where package_id is not null;
create unique index if not exists one_legacy_assignment_per_document_user
  on public.training_assignments (document_id, user_id) where package_id is null;
create index if not exists assignments_user_idx on public.training_assignments (user_id, status);
create index if not exists assignments_package_idx on public.training_assignments (package_id, status);

-- P9 assign_training targeted the dropped blanket unique; re-point it at the
-- legacy partial index. Same signature, same behavior.
create or replace function public.assign_training(p_document uuid, p_user uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v_caller uuid := auth.uid(); begin
  select * into d from public.documents where id=p_document;
  if not (app.is_qa(v_caller) or app.has_role(v_caller,'trainer')) then raise exception 'assign_training: QA/trainer only'; end if;
  insert into public.training_assignments(tenant_id, org_id, document_id, user_id, assigned_by)
    values (d.tenant_id, d.org_id, p_document, p_user, v_caller)
    on conflict (document_id, user_id) where package_id is null do nothing;
  perform app.write_audit('training.assigned', v_caller, null, d.tenant_id, d.org_id, d.department_id,
    'training_assignment', p_document::text, null, jsonb_build_object('user', p_user), null, 'D-TRAINING');
end; $$;

-- Assessment attempts — append-only, never overwritten (plan §6).
create table if not exists public.assessment_attempts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  assignment_id uuid not null references public.training_assignments(id),
  attempt_no    int not null,
  answers       jsonb not null,     -- {question_id: chosen_index}
  score         numeric(5,2) not null,
  passed        boolean not null,
  submitted_at  timestamptz not null default now(),
  unique (assignment_id, attempt_no)
);
alter table public.assessment_attempts enable row level security;
alter table public.assessment_attempts force row level security;
drop policy if exists attempts_read on public.assessment_attempts;
create policy attempts_read on public.assessment_attempts for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and (app.is_trainer(auth.uid())
              or exists (select 1 from public.training_assignments a
                         where a.id = assignment_id and a.user_id = auth.uid())));
grant select on public.assessment_attempts to authenticated;

create or replace function app.attempts_guard() returns trigger
language plpgsql as $$
begin
  raise exception 'assessment_attempts is append-only: % is not permitted', tg_op;
end; $$;
drop trigger if exists attempts_guard_rows on public.assessment_attempts;
create trigger attempts_guard_rows before update or delete on public.assessment_attempts
  for each row execute function app.attempts_guard();

-- Certificates — issued on pass, verifiable by uid (plan §7). Document identity
-- is SNAPSHOTTED (number/title/revision) so the certificate stays truthful even
-- after later renames.
create table if not exists public.certificates (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id),
  org_id              uuid not null references public.organizations(id),
  assignment_id       uuid not null unique references public.training_assignments(id),
  certificate_uid     text not null unique,
  trainee_id          uuid not null references public.users(id),
  document_id         uuid not null references public.documents(id),
  document_version_id uuid not null references public.document_versions(id),
  document_number     text,
  document_title      text not null,
  revision_number     int,
  score               numeric(5,2) not null,
  assigned_by         uuid,
  issued_at           timestamptz not null default now()
);
alter table public.certificates enable row level security;
alter table public.certificates force row level security;
drop policy if exists certificates_read on public.certificates;
create policy certificates_read on public.certificates for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and (trainee_id = auth.uid() or app.is_trainer(auth.uid())));
grant select on public.certificates to authenticated;

-- ---------------------------------------------------------------------------
-- Package lifecycle RPCs (plan §4.1). The human gate lives at approve: only an
-- approved package is assignable, and only draft_review content is editable.
-- ---------------------------------------------------------------------------
create or replace function public.create_training_package(
  p_version uuid, p_template text, p_question_count int default 5, p_pass_mark int default null)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v public.document_versions; d public.documents; v_caller uuid := auth.uid(); v_id uuid;
begin
  if not app.is_trainer(v_caller) then raise exception 'create_training_package: trainer/QA only'; end if;
  select * into v from public.document_versions where id = p_version;
  if v.id is null then raise exception 'create_training_package: no such version'; end if;
  if v.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'create_training_package: no such version'; end if;
  if not app.module_enabled(v.tenant_id, 'training') then
    raise exception 'create_training_package: training module is off for this tenant'; end if;
  if v.status not in ('approved','effective') then
    raise exception 'create_training_package: training is built on approved content (version is %)', v.status; end if;
  select * into d from public.documents where id = v.document_id;
  insert into public.training_packages(tenant_id, org_id, department_id, document_id, document_version_id,
      template_key, question_count, pass_mark, created_by)
    values (v.tenant_id, v.org_id, v.department_id, v.document_id, p_version,
            p_template, p_question_count, p_pass_mark, v_caller)
    returning id into v_id;
  perform app.write_audit('training.package_created', v_caller, null, v.tenant_id, v.org_id, v.department_id,
    'training_package', v_id::text, null,
    jsonb_build_object('version', p_version, 'template', p_template, 'question_count', p_question_count),
    null, 'T-PACKAGES');
  return v_id;
end; $$;

-- The gateway (server-side service) stores what the AI produced, as the acting
-- trainer. Slides/questions land as drafts with ai_draft provenance retained;
-- the provenance log row and the audit entry are written in the same call.
create or replace function public.store_ai_draft(
  p_package uuid, p_slides jsonb, p_questions jsonb, p_provider text, p_model text)
returns void language plpgsql security definer set search_path = app, public as $$
declare pk public.training_packages; v_caller uuid := auth.uid(); s jsonb; q jsonb; i int := 0;
begin
  select * into pk from public.training_packages where id = p_package for update;
  if pk.id is null or pk.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'store_ai_draft: no such package'; end if;
  if not app.is_trainer(v_caller) then raise exception 'store_ai_draft: trainer/QA only'; end if;
  if pk.state not in ('generating','draft_review') then
    raise exception 'store_ai_draft: package is % — drafts only land before approval', pk.state; end if;
  if jsonb_typeof(p_slides) <> 'array' or jsonb_array_length(p_slides) = 0 then
    raise exception 'store_ai_draft: at least one slide required'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'store_ai_draft: at least one question required'; end if;

  delete from public.training_slides where package_id = p_package;
  for s in select * from jsonb_array_elements(p_slides) loop
    i := i + 1;
    insert into public.training_slides(tenant_id, package_id, position, title, body, ai_draft)
      values (pk.tenant_id, p_package, i, coalesce(s->>'title',''), coalesce(s->>'body',''), s);
  end loop;
  i := 0;
  delete from public.training_questions where package_id = p_package;
  for q in select * from jsonb_array_elements(p_questions) loop
    i := i + 1;
    if jsonb_typeof(q->'options') <> 'array' or jsonb_array_length(q->'options') < 2 then
      raise exception 'store_ai_draft: question % needs at least two options', i; end if;
    if coalesce((q->>'correct_index')::int, -1) not between 0 and jsonb_array_length(q->'options') - 1 then
      raise exception 'store_ai_draft: question % has an out-of-range correct_index', i; end if;
    insert into public.training_questions(tenant_id, package_id, position, question, options, correct_index, explanation, ai_draft)
      values (pk.tenant_id, p_package, i, coalesce(q->>'question',''), q->'options',
              (q->>'correct_index')::int, q->>'explanation', q);
  end loop;

  update public.training_packages set state = 'draft_review' where id = p_package;
  insert into public.ai_gateway_log(tenant_id, operation, provider, model_version, requested_by,
      document_version_id, package_id, status, output_ref)
    values (pk.tenant_id, 'generate_package', p_provider, p_model, v_caller,
            pk.document_version_id, p_package, 'success',
            jsonb_build_object('slides', jsonb_array_length(p_slides),
                               'questions', jsonb_array_length(p_questions))::text);
  perform app.write_audit('training.ai_generated', v_caller, null, pk.tenant_id, pk.org_id, pk.department_id,
    'training_package', p_package::text, null,
    jsonb_build_object('provider', p_provider, 'model', p_model,
                       'slides', jsonb_array_length(p_slides), 'questions', jsonb_array_length(p_questions)),
    null, 'T-PACKAGES');
end; $$;

-- Provider failure — logged with provenance, never blocks anything (§3.5):
-- the package drops to draft_review so the trainer can author manually or retry.
create or replace function public.log_ai_failure(p_package uuid, p_provider text, p_model text, p_error text)
returns void language plpgsql security definer set search_path = app, public as $$
declare pk public.training_packages; v_caller uuid := auth.uid();
begin
  select * into pk from public.training_packages where id = p_package for update;
  if pk.id is null or pk.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'log_ai_failure: no such package'; end if;
  if not app.is_trainer(v_caller) then raise exception 'log_ai_failure: trainer/QA only'; end if;
  insert into public.ai_gateway_log(tenant_id, operation, provider, model_version, requested_by,
      document_version_id, package_id, status, error)
    values (pk.tenant_id, 'generate_package', p_provider, p_model, v_caller,
            pk.document_version_id, p_package, 'error', p_error);
  if pk.state = 'generating' then
    update public.training_packages set state = 'draft_review' where id = p_package;
  end if;
  perform app.write_audit('training.ai_failed', v_caller, null, pk.tenant_id, pk.org_id, pk.department_id,
    'training_package', p_package::text, null, jsonb_build_object('provider', p_provider, 'error', p_error),
    null, 'T-PACKAGES');
end; $$;

-- Editing — draft_review only (the trainer polishing the draft, §5/§6).
create or replace function app.editable_package(p_package uuid, p_caller uuid)
returns public.training_packages language plpgsql security definer set search_path = app, public as $$
declare pk public.training_packages;
begin
  select * into pk from public.training_packages where id = p_package for update;
  if pk.id is null or pk.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'training package: not found'; end if;
  if not app.is_trainer(p_caller) then raise exception 'training package: trainer/QA only'; end if;
  if pk.state <> 'draft_review' then
    raise exception 'training package: content is editable only in draft review (state is %)', pk.state; end if;
  return pk;
end; $$;

create or replace function public.update_training_slide(p_slide uuid, p_title text, p_body text)
returns void language plpgsql security definer set search_path = app, public as $$
declare sl public.training_slides; pk public.training_packages; v_caller uuid := auth.uid();
begin
  select * into sl from public.training_slides where id = p_slide;
  if sl.id is null then raise exception 'update_training_slide: no such slide'; end if;
  pk := app.editable_package(sl.package_id, v_caller);
  update public.training_slides set title = p_title, body = p_body, edited_by = v_caller, updated_at = now()
    where id = p_slide;
  perform app.write_audit('training.slide_edited', v_caller, null, pk.tenant_id, pk.org_id, pk.department_id,
    'training_slide', p_slide::text, jsonb_build_object('title', sl.title),
    jsonb_build_object('title', p_title), null, 'T-REVIEW');
end; $$;

create or replace function public.add_training_slide(p_package uuid, p_title text default '', p_body text default '')
returns uuid language plpgsql security definer set search_path = app, public as $$
declare pk public.training_packages; v_caller uuid := auth.uid(); v_id uuid; v_pos int;
begin
  pk := app.editable_package(p_package, v_caller);
  select coalesce(max(position),0)+1 into v_pos from public.training_slides where package_id = p_package;
  insert into public.training_slides(tenant_id, package_id, position, title, body, edited_by)
    values (pk.tenant_id, p_package, v_pos, p_title, p_body, v_caller) returning id into v_id;
  perform app.write_audit('training.slide_added', v_caller, null, pk.tenant_id, pk.org_id, pk.department_id,
    'training_slide', v_id::text, null, jsonb_build_object('position', v_pos), null, 'T-REVIEW');
  return v_id;
end; $$;

create or replace function public.delete_training_slide(p_slide uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare sl public.training_slides; pk public.training_packages; v_caller uuid := auth.uid();
begin
  select * into sl from public.training_slides where id = p_slide;
  if sl.id is null then raise exception 'delete_training_slide: no such slide'; end if;
  pk := app.editable_package(sl.package_id, v_caller);
  delete from public.training_slides where id = p_slide;
  update public.training_slides set position = position - 1
    where package_id = sl.package_id and position > sl.position;
  perform app.write_audit('training.slide_deleted', v_caller, null, pk.tenant_id, pk.org_id, pk.department_id,
    'training_slide', p_slide::text, jsonb_build_object('title', sl.title), null, null, 'T-REVIEW');
end; $$;

create or replace function public.reorder_training_slides(p_package uuid, p_order uuid[])
returns void language plpgsql security definer set search_path = app, public as $$
declare pk public.training_packages; v_caller uuid := auth.uid(); v_count int;
begin
  pk := app.editable_package(p_package, v_caller);
  select count(*) into v_count from public.training_slides where package_id = p_package;
  if v_count <> coalesce(array_length(p_order, 1), 0)
     or exists (select 1 from public.training_slides s where s.package_id = p_package
                and s.id <> all(p_order)) then
    raise exception 'reorder_training_slides: the order must list every slide exactly once'; end if;
  update public.training_slides s set position = o.pos, edited_by = v_caller, updated_at = now()
    from (select unnest(p_order) as id, generate_series(1, array_length(p_order,1)) as pos) o
    where s.id = o.id and s.package_id = p_package;
  perform app.write_audit('training.slides_reordered', v_caller, null, pk.tenant_id, pk.org_id, pk.department_id,
    'training_package', p_package::text, null, jsonb_build_object('count', v_count), null, 'T-REVIEW');
end; $$;

create or replace function public.update_training_question(
  p_question uuid, p_text text, p_options jsonb, p_correct_index int, p_explanation text default null)
returns void language plpgsql security definer set search_path = app, public as $$
declare qq public.training_questions; pk public.training_packages; v_caller uuid := auth.uid();
begin
  select * into qq from public.training_questions where id = p_question;
  if qq.id is null then raise exception 'update_training_question: no such question'; end if;
  pk := app.editable_package(qq.package_id, v_caller);
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 then
    raise exception 'update_training_question: at least two options required'; end if;
  if p_correct_index not between 0 and jsonb_array_length(p_options) - 1 then
    raise exception 'update_training_question: correct_index out of range'; end if;
  update public.training_questions
    set question = p_text, options = p_options, correct_index = p_correct_index,
        explanation = p_explanation, edited_by = v_caller, updated_at = now()
    where id = p_question;
  perform app.write_audit('training.question_edited', v_caller, null, pk.tenant_id, pk.org_id, pk.department_id,
    'training_question', p_question::text, null, jsonb_build_object('question', left(p_text, 80)), null, 'T-REVIEW');
end; $$;

create or replace function public.add_training_question(
  p_package uuid, p_text text, p_options jsonb, p_correct_index int, p_explanation text default null)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare pk public.training_packages; v_caller uuid := auth.uid(); v_id uuid; v_pos int;
begin
  pk := app.editable_package(p_package, v_caller);
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) < 2 then
    raise exception 'add_training_question: at least two options required'; end if;
  if p_correct_index not between 0 and jsonb_array_length(p_options) - 1 then
    raise exception 'add_training_question: correct_index out of range'; end if;
  select coalesce(max(position),0)+1 into v_pos from public.training_questions where package_id = p_package;
  insert into public.training_questions(tenant_id, package_id, position, question, options, correct_index, explanation, edited_by)
    values (pk.tenant_id, p_package, v_pos, p_text, p_options, p_correct_index, p_explanation, v_caller)
    returning id into v_id;
  perform app.write_audit('training.question_added', v_caller, null, pk.tenant_id, pk.org_id, pk.department_id,
    'training_question', v_id::text, null, jsonb_build_object('position', v_pos), null, 'T-REVIEW');
  return v_id;
end; $$;

create or replace function public.delete_training_question(p_question uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare qq public.training_questions; pk public.training_packages; v_caller uuid := auth.uid();
begin
  select * into qq from public.training_questions where id = p_question;
  if qq.id is null then raise exception 'delete_training_question: no such question'; end if;
  pk := app.editable_package(qq.package_id, v_caller);
  delete from public.training_questions where id = p_question;
  update public.training_questions set position = position - 1
    where package_id = qq.package_id and position > qq.position;
  perform app.write_audit('training.question_deleted', v_caller, null, pk.tenant_id, pk.org_id, pk.department_id,
    'training_question', p_question::text, jsonb_build_object('question', left(qq.question, 80)), null, null, 'T-REVIEW');
end; $$;

create or replace function public.reorder_training_questions(p_package uuid, p_order uuid[])
returns void language plpgsql security definer set search_path = app, public as $$
declare pk public.training_packages; v_caller uuid := auth.uid(); v_count int;
begin
  pk := app.editable_package(p_package, v_caller);
  select count(*) into v_count from public.training_questions where package_id = p_package;
  if v_count <> coalesce(array_length(p_order, 1), 0)
     or exists (select 1 from public.training_questions q where q.package_id = p_package
                and q.id <> all(p_order)) then
    raise exception 'reorder_training_questions: the order must list every question exactly once'; end if;
  update public.training_questions q set position = o.pos, edited_by = v_caller, updated_at = now()
    from (select unnest(p_order) as id, generate_series(1, array_length(p_order,1)) as pos) o
    where q.id = o.id and q.package_id = p_package;
  perform app.write_audit('training.questions_reordered', v_caller, null, pk.tenant_id, pk.org_id, pk.department_id,
    'training_package', p_package::text, null, jsonb_build_object('count', v_count), null, 'T-REVIEW');
end; $$;

-- THE HUMAN GATE (§1.1): only a trainer's audited approval makes AI content
-- assignable. No override, no config to weaken it.
create or replace function public.approve_training_package(p_package uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare pk public.training_packages; v_caller uuid := auth.uid(); v_slides int; v_questions int;
begin
  select * into pk from public.training_packages where id = p_package for update;
  if pk.id is null or pk.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'approve_training_package: no such package'; end if;
  if not app.is_trainer(v_caller) then raise exception 'approve_training_package: trainer/QA only'; end if;
  if pk.state <> 'draft_review' then
    raise exception 'approve_training_package: only a draft under review can be approved (state is %)', pk.state; end if;
  select count(*) into v_slides from public.training_slides where package_id = p_package;
  select count(*) into v_questions from public.training_questions where package_id = p_package;
  if v_slides = 0 or v_questions = 0 then
    raise exception 'approve_training_package: a package needs at least one slide and one question'; end if;
  update public.training_packages
    set state = 'approved', approved_by = v_caller, approved_at = now() where id = p_package;
  perform app.write_audit('training.package_approved', v_caller, null, pk.tenant_id, pk.org_id, pk.department_id,
    'training_package', p_package::text, jsonb_build_object('state','draft_review'),
    jsonb_build_object('state','approved','slides',v_slides,'questions',v_questions), null, 'T-REVIEW');
end; $$;

create or replace function public.close_training_package(p_package uuid, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare pk public.training_packages; v_caller uuid := auth.uid();
begin
  select * into pk from public.training_packages where id = p_package for update;
  if pk.id is null or pk.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'close_training_package: no such package'; end if;
  if not app.is_trainer(v_caller) then raise exception 'close_training_package: trainer/QA only'; end if;
  if pk.state = 'closed' then return; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'close_training_package: reason required'; end if;
  update public.training_packages
    set state = 'closed', closed_at = now(), close_reason = p_reason where id = p_package;
  perform app.write_audit('training.package_closed', v_caller, null, pk.tenant_id, pk.org_id, pk.department_id,
    'training_package', p_package::text, jsonb_build_object('state', pk.state),
    jsonb_build_object('state','closed'), p_reason, 'T-PACKAGES');
end; $$;

-- ---------------------------------------------------------------------------
-- Assignment (plan §4 step 2) — approved packages only.
-- ---------------------------------------------------------------------------
create or replace function public.assign_training_package(
  p_package uuid, p_users uuid[], p_due timestamptz default null)
returns int language plpgsql security definer set search_path = app, public as $$
declare pk public.training_packages; v_caller uuid := auth.uid(); v_due timestamptz;
        v_user uuid; v_n int := 0; v_days int;
begin
  select * into pk from public.training_packages where id = p_package for update;
  if pk.id is null or pk.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'assign_training_package: no such package'; end if;
  if not app.is_trainer(v_caller) then raise exception 'assign_training_package: trainer/QA only'; end if;
  if pk.state not in ('approved','assigned') then
    raise exception 'assign_training_package: only an APPROVED package can be assigned (state is %) — the human gate is not optional', pk.state; end if;
  if coalesce(array_length(p_users, 1), 0) = 0 then
    raise exception 'assign_training_package: no trainees given'; end if;

  select coalesce((select default_due_days from public.training_settings where tenant_id = pk.tenant_id), 14)
    into v_days;
  v_due := coalesce(p_due, now() + make_interval(days => v_days));

  foreach v_user in array p_users loop
    if not exists (select 1 from public.users u
                   where u.id = v_user and u.tenant_id = pk.tenant_id and u.status = 'active') then
      raise exception 'assign_training_package: % is not an active user of this tenant', v_user; end if;
    insert into public.training_assignments(tenant_id, org_id, document_id, user_id, assigned_by,
        package_id, due_at)
      values (pk.tenant_id, pk.org_id, pk.document_id, v_user, v_caller, p_package, v_due)
      on conflict (package_id, user_id) where package_id is not null do nothing;
    if found then
      v_n := v_n + 1;
      perform app.write_audit('training.assigned', v_caller, null, pk.tenant_id, pk.org_id, pk.department_id,
        'training_assignment', p_package::text, null,
        jsonb_build_object('user', v_user, 'due', v_due, 'package', p_package), null, 'T-ASSIGN');
    end if;
  end loop;

  if pk.state = 'approved' and v_n > 0 then
    update public.training_packages set state = 'assigned' where id = p_package;
  end if;
  return v_n;
end; $$;

-- ---------------------------------------------------------------------------
-- Trainee flow (plan §4 step 3): start → slides progress → assessment → pass.
-- ---------------------------------------------------------------------------
create or replace function app.own_assignment(p_assignment uuid, p_caller uuid)
returns public.training_assignments language plpgsql security definer set search_path = app, public as $$
declare a public.training_assignments;
begin
  select * into a from public.training_assignments where id = p_assignment for update;
  if a.id is null or a.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'training: no such assignment'; end if;
  if a.user_id <> p_caller then raise exception 'training: this is not your assignment'; end if;
  return a;
end; $$;

-- The single door through which a trainee receives training content (slides
-- never carry answers; questions are NOT in this payload). Starts the
-- assignment on first open. Includes branding for the deck chrome.
create or replace function public.get_training_content(p_assignment uuid)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare a public.training_assignments; pk public.training_packages; v_caller uuid := auth.uid();
        v_slides jsonb; v_doc jsonb; v_brand jsonb;
begin
  select * into a from public.training_assignments where id = p_assignment for update;
  if a.id is null or a.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'get_training_content: no such assignment'; end if;
  if a.user_id <> v_caller and not app.is_trainer(v_caller) then
    raise exception 'get_training_content: the trainee, trainer, or QA only'; end if;
  if a.package_id is null then raise exception 'get_training_content: a legacy assignment has no package'; end if;
  select * into pk from public.training_packages where id = a.package_id;

  if a.user_id = v_caller and a.status = 'assigned' then
    update public.training_assignments set status = 'in_progress', started_at = now() where id = a.id;
    perform app.write_audit('training.started', v_caller, null, a.tenant_id, a.org_id, null,
      'training_assignment', a.id::text, jsonb_build_object('status','assigned'),
      jsonb_build_object('status','in_progress'), null, 'T-LEARN');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'position', s.position,
           'title', s.title, 'body', s.body) order by s.position), '[]'::jsonb)
    into v_slides from public.training_slides s where s.package_id = pk.id;
  select jsonb_build_object('number', d.document_number, 'title', d.title,
           'revision', v.revision_number, 'version_id', v.id)
    into v_doc from public.documents d
    join public.document_versions v on v.id = pk.document_version_id
    where d.id = pk.document_id;
  select jsonb_build_object('name', coalesce(b.org_display_name, o.name), 'logo', b.logo_ref,
           'color_primary', b.color_primary, 'color_secondary', b.color_secondary, 'color_accent', b.color_accent)
    into v_brand from public.organizations o
    left join public.tenant_branding b on b.tenant_id = o.tenant_id
    where o.id = pk.org_id;

  return jsonb_build_object(
    'assignment_id', a.id, 'status', (select status from public.training_assignments where id = a.id),
    'progress_pct', a.slide_progress_pct, 'due_at', a.due_at,
    'template', pk.template_key, 'pass_mark', app.training_pass_mark(pk.tenant_id, pk.id),
    'document', v_doc, 'branding', coalesce(v_brand, '{}'::jsonb), 'slides', v_slides,
    'question_count', (select count(*) from public.training_questions where package_id = pk.id));
end; $$;

create or replace function app.training_pass_mark(p_tenant uuid, p_package uuid)
returns int language sql stable security definer set search_path = app, public as $$
  select coalesce(
    (select pass_mark from public.training_packages where id = p_package),
    (select pass_mark from public.training_settings where tenant_id = p_tenant),
    80);
$$;

-- Slide progress: monotonic (resume support §5); 100% opens the assessment.
create or replace function public.save_training_progress(p_assignment uuid, p_pct int)
returns text language plpgsql security definer set search_path = app, public as $$
declare a public.training_assignments; v_caller uuid := auth.uid(); v_new int;
begin
  a := app.own_assignment(p_assignment, v_caller);
  if a.status not in ('in_progress','assigned') then
    return a.status; end if;
  if p_pct not between 0 and 100 then raise exception 'save_training_progress: pct out of range'; end if;
  v_new := greatest(a.slide_progress_pct, p_pct);   -- never backwards
  if a.status = 'assigned' then
    update public.training_assignments set status='in_progress', started_at=coalesce(started_at, now())
      where id = a.id;
  end if;
  update public.training_assignments set slide_progress_pct = v_new where id = a.id;
  if v_new = 100 then
    update public.training_assignments set status = 'awaiting_assessment' where id = a.id;
    perform app.write_audit('training.slides_completed', v_caller, null, a.tenant_id, a.org_id, null,
      'training_assignment', a.id::text, jsonb_build_object('status','in_progress'),
      jsonb_build_object('status','awaiting_assessment'), null, 'T-LEARN');
    return 'awaiting_assessment';
  end if;
  return 'in_progress';
end; $$;

-- Assessment questions for the trainee — STRIPPED of correct answers. Grading
-- only ever happens server-side in submit_assessment.
create or replace function public.get_assessment(p_assignment uuid)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare a public.training_assignments; v_caller uuid := auth.uid(); v_qs jsonb;
        v_attempts int; v_max int;
begin
  a := app.own_assignment(p_assignment, v_caller);
  if a.status <> 'awaiting_assessment' then
    raise exception 'get_assessment: finish the slides first (status is %)', a.status; end if;
  select count(*) into v_attempts from public.assessment_attempts where assignment_id = a.id;
  select max_attempts into v_max from public.training_settings where tenant_id = a.tenant_id;
  if v_max is not null and v_attempts >= v_max then
    raise exception 'get_assessment: no attempts left (% of %)', v_attempts, v_max; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'position', q.position,
           'question', q.question, 'options', q.options) order by q.position), '[]'::jsonb)
    into v_qs from public.training_questions q where q.package_id = a.package_id;
  return jsonb_build_object('assignment_id', a.id, 'attempt_no', v_attempts + 1,
    'max_attempts', v_max, 'pass_mark', app.training_pass_mark(a.tenant_id, a.package_id),
    'questions', v_qs);
end; $$;

-- Submit: grade server-side, append the attempt (never overwritten), pass →
-- completed + certificate issued automatically (plan §4 steps 3–4, §7).
create or replace function public.submit_assessment(p_assignment uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = app, public as $$
declare a public.training_assignments; pk public.training_packages; v_caller uuid := auth.uid();
        v_attempts int; v_max int; v_total int := 0; v_correct int := 0; q record;
        v_score numeric(5,2); v_pass_mark int; v_passed boolean; v_attempt uuid;
        v_cert_uid text; v_cert uuid; d public.documents; v public.document_versions;
begin
  a := app.own_assignment(p_assignment, v_caller);
  if a.status <> 'awaiting_assessment' then
    raise exception 'submit_assessment: not awaiting assessment (status is %)', a.status; end if;
  select count(*) into v_attempts from public.assessment_attempts where assignment_id = a.id;
  select max_attempts into v_max from public.training_settings where tenant_id = a.tenant_id;
  if v_max is not null and v_attempts >= v_max then
    raise exception 'submit_assessment: no attempts left (% of %)', v_attempts, v_max; end if;

  for q in select * from public.training_questions where package_id = a.package_id loop
    v_total := v_total + 1;
    if (p_answers->>(q.id::text))::int = q.correct_index then v_correct := v_correct + 1; end if;
  end loop;
  if v_total = 0 then raise exception 'submit_assessment: the package has no questions'; end if;

  v_score := round(v_correct * 100.0 / v_total, 2);
  v_pass_mark := app.training_pass_mark(a.tenant_id, a.package_id);
  v_passed := v_score >= v_pass_mark;

  insert into public.assessment_attempts(tenant_id, assignment_id, attempt_no, answers, score, passed)
    values (a.tenant_id, a.id, v_attempts + 1, p_answers, v_score, v_passed)
    returning id into v_attempt;
  perform app.write_audit('assessment.submitted', v_caller, null, a.tenant_id, a.org_id, null,
    'assessment_attempt', v_attempt::text, null,
    jsonb_build_object('attempt', v_attempts + 1, 'score', v_score, 'passed', v_passed,
                       'pass_mark', v_pass_mark), null, 'T-LEARN');

  if v_passed then
    update public.training_assignments set status='completed', completed_at=now(), slide_progress_pct=100
      where id = a.id;
    select * into pk from public.training_packages where id = a.package_id;
    select * into d from public.documents where id = pk.document_id;
    select * into v from public.document_versions where id = pk.document_version_id;
    v_cert_uid := 'CERT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    insert into public.certificates(tenant_id, org_id, assignment_id, certificate_uid, trainee_id,
        document_id, document_version_id, document_number, document_title, revision_number,
        score, assigned_by)
      values (a.tenant_id, a.org_id, a.id, v_cert_uid, a.user_id,
              pk.document_id, pk.document_version_id, d.document_number, d.title, v.revision_number,
              v_score, a.assigned_by)
      returning id into v_cert;
    perform app.write_audit('certificate.issued', v_caller, null, a.tenant_id, a.org_id, pk.department_id,
      'certificate', v_cert_uid, null,
      jsonb_build_object('trainee', a.user_id, 'document', d.document_number, 'revision', v.revision_number,
                         'score', v_score), null, 'T-LEARN');
  end if;

  return jsonb_build_object('score', v_score, 'passed', v_passed, 'pass_mark', v_pass_mark,
    'correct', v_correct, 'total', v_total, 'attempt_no', v_attempts + 1,
    'attempts_left', case when v_max is null then null else v_max - v_attempts - 1 end,
    'certificate_uid', v_cert_uid);
end; $$;

-- Training normally completes BEFORE release, and the core allocates the
-- revision number only at effective time — so certificates issued at the gate
-- snapshot a null revision. Backfill it the moment the trained version goes
-- effective (enrichment only; gates nothing, weakens nothing).
create or replace function app.backfill_certificate_revision() returns trigger
language plpgsql security definer set search_path = app, public as $$
begin
  if new.status = 'effective' and new.revision_number is not null then
    update public.certificates set revision_number = new.revision_number
      where document_version_id = new.id and revision_number is null;
  end if;
  return new;
end; $$;
drop trigger if exists certificates_revision_backfill on public.document_versions;
create trigger certificates_revision_backfill after update of status on public.document_versions
  for each row execute function app.backfill_certificate_revision();

-- Certificate verification (plan §7): an inspector checks a paper certificate
-- against the record by its uid. Tenant-scoped.
create or replace function public.verify_certificate(p_uid text)
returns jsonb language plpgsql stable security definer set search_path = app, public as $$
declare c public.certificates; v_name text;
begin
  select * into c from public.certificates
    where certificate_uid = upper(trim(p_uid)) and tenant_id = public.current_tenant_id();
  if c.id is null then return jsonb_build_object('valid', false); end if;
  select coalesce(full_name, email) into v_name from public.users where id = c.trainee_id;
  return jsonb_build_object('valid', true, 'certificate_uid', c.certificate_uid,
    'trainee', v_name, 'document_number', c.document_number, 'document_title', c.document_title,
    'revision', c.revision_number, 'score', c.score, 'issued_at', c.issued_at);
end; $$;

-- The trainee's own view (plan §8): assignments + progress + certificates,
-- enriched past RLS's trainer-only package visibility through the one door.
create or replace function public.my_training()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'assignment_id', a.id, 'status', a.status, 'progress_pct', a.slide_progress_pct,
      'due_at', a.due_at, 'assigned_at', a.assigned_at, 'completed_at', a.completed_at,
      'overdue', a.status <> 'completed' and a.due_at is not null and a.due_at < now(),
      'document_number', d.document_number, 'document_title', d.title,
      'revision', v.revision_number, 'package_id', a.package_id,
      'certificate_uid', c.certificate_uid, 'score', c.score)
    order by a.assigned_at desc), '[]'::jsonb)
  from public.training_assignments a
  join public.documents d on d.id = a.document_id
  left join public.training_packages p on p.id = a.package_id
  left join public.document_versions v on v.id = p.document_version_id
  left join public.certificates c on c.assignment_id = a.id
  where a.user_id = auth.uid() and a.tenant_id = public.current_tenant_id();
$$;

-- ---------------------------------------------------------------------------
-- THE SEAM (plan §2) — real answers replacing the P9 mock internals.
-- ---------------------------------------------------------------------------

-- (1) is_training_required(version): an open package exists for the version, or
-- its document is holding at the pending_training gate.
create or replace function app.is_training_required(p_version uuid)
returns boolean language sql stable security definer set search_path = app, public as $$
  select exists (select 1 from public.training_packages
                 where document_version_id = p_version and state <> 'closed')
      or exists (select 1 from public.document_versions v
                 join public.documents d on d.id = v.document_id
                 where v.id = p_version and v.status = 'approved' and d.status = 'pending_training');
$$;
grant execute on function app.is_training_required(uuid) to authenticated, service_role;

-- (2) is_threshold_met: document_training_met becomes PACKAGE-AWARE. If an open
-- package exists for the version being released, the threshold is computed over
-- that package's assignments; otherwise the legacy document-level computation
-- (P6/P9 behavior) applies unchanged. Zero assignments → met (the gate holds at
-- resolve time; release with nobody assigned stays a trainer's audited call).
create or replace function app.version_training_met(p_tenant uuid, p_version uuid)
returns boolean language sql stable security definer set search_path = app, public as $$
  with pkg as (select id from public.training_packages
               where document_version_id = p_version and state <> 'closed' limit 1),
       a as (select count(*) total, count(*) filter (where status = 'completed') done
             from public.training_assignments where package_id = (select id from pkg)),
       thr as (select coalesce((select (config->>'threshold')::numeric from public.tenant_modules
               where tenant_id = p_tenant and module_key = 'training'), 100) t)
  select case when (select id from pkg) is null then null            -- no package → caller falls back
              when (select total from a) = 0 then true
              else (select done from a) * 100.0 / (select total from a) >= (select t from thr) end;
$$;

create or replace function app.document_training_met(p_tenant uuid, p_document uuid) returns boolean
language plpgsql stable security definer set search_path = app, public as $$
declare v_version uuid; v_pkg boolean;
begin
  -- The version being gated: the newest approved (pre-effective) version.
  select id into v_version from public.document_versions
    where document_id = p_document and status = 'approved'
    order by created_at desc limit 1;
  if v_version is not null then
    v_pkg := app.version_training_met(p_tenant, v_version);
    if v_pkg is not null then return v_pkg; end if;
  end if;
  -- Legacy document-level fallback (P9 behavior, unchanged).
  return (
    with a as (select count(*) total, count(*) filter (where status='completed') done
               from public.training_assignments where document_id = p_document and package_id is null),
         thr as (select coalesce((select (config->>'threshold')::numeric from public.tenant_modules
                 where tenant_id=p_tenant and module_key='training'), 100) t)
    select case when (select total from a) = 0 then true
                else (select done from a) * 100.0 / (select total from a) >= (select t from thr) end);
end; $$;

-- (3) is_user_trained(user, version): a completed assignment on an open package
-- for that exact version (version-specific — rev 02 never counts for rev 03).
-- Legacy document-level completions count only for versions of that document
-- with no package (the pre-module data).
create or replace function app.is_user_trained(p_user uuid, p_version uuid)
returns boolean language sql stable security definer set search_path = app, public as $$
  select exists (
    select 1 from public.training_assignments a
    join public.training_packages p on p.id = a.package_id
    where a.user_id = p_user and a.status = 'completed'
      and p.document_version_id = p_version and p.state <> 'closed')
  or (not exists (select 1 from public.training_packages
                  where document_version_id = p_version and state <> 'closed')
      and exists (
        select 1 from public.training_assignments a
        join public.document_versions v on v.document_id = a.document_id
        where a.user_id = p_user and a.status = 'completed' and a.package_id is null
          and v.id = p_version));
$$;
grant execute on function app.is_user_trained(uuid, uuid) to authenticated, service_role;

-- The core-side execution-block guard (plan §2 point 3). The core has no
-- execution RPC yet; every future execution feature MUST call this before
-- letting a user perform against a document. Blocks only when the module is on,
-- training is required for the effective version, and the user is untrained.
create or replace function app.enforce_trained_for_execution(p_user uuid, p_document uuid)
returns void language plpgsql stable security definer set search_path = app, public as $$
declare d public.documents; v_version uuid;
begin
  select * into d from public.documents where id = p_document;
  if d.id is null then return; end if;
  if not app.module_enabled(d.tenant_id, 'training') then return; end if;   -- safe default
  select current_version_id into v_version from public.documents where id = p_document;
  if v_version is null then return; end if;
  if app.is_training_required(v_version) and not app.is_user_trained(p_user, v_version) then
    raise exception 'execution blocked: training on % (current revision) is required and not completed', d.document_number
      using errcode = 'P0001';
  end if;
end; $$;
grant execute on function app.enforce_trained_for_execution(uuid, uuid) to authenticated, service_role;

-- UI surface of the same answer (banner on the read surface / T-LEARN).
create or replace function public.my_training_status(p_document uuid)
returns jsonb language plpgsql stable security definer set search_path = app, public as $$
declare d public.documents; v_version uuid; v_required boolean; v_trained boolean;
begin
  select * into d from public.documents where id = p_document;
  if d.id is null or d.tenant_id is distinct from public.current_tenant_id() then
    return jsonb_build_object('required', false, 'trained', true, 'blocked', false); end if;
  if not app.module_enabled(d.tenant_id, 'training') or d.current_version_id is null then
    return jsonb_build_object('required', false, 'trained', true, 'blocked', false); end if;
  v_version := d.current_version_id;
  v_required := app.is_training_required(v_version);
  v_trained  := app.is_user_trained(auth.uid(), v_version);
  return jsonb_build_object('required', v_required, 'trained', v_trained,
    'blocked', v_required and not v_trained);
end; $$;

-- Threshold-vs-release status for the dashboard (plan §8): how far from the
-- seam answering "met".
create or replace function public.training_threshold_status(p_package uuid)
returns jsonb language plpgsql stable security definer set search_path = app, public as $$
declare pk public.training_packages; v_total int; v_done int; v_thr numeric;
begin
  select * into pk from public.training_packages where id = p_package;
  if pk.id is null or pk.tenant_id is distinct from public.current_tenant_id()
     or not app.is_trainer(auth.uid()) then
    raise exception 'training_threshold_status: trainer/QA only'; end if;
  select count(*), count(*) filter (where status='completed') into v_total, v_done
    from public.training_assignments where package_id = p_package;
  select coalesce((select (config->>'threshold')::numeric from public.tenant_modules
    where tenant_id = pk.tenant_id and module_key = 'training'), 100) into v_thr;
  return jsonb_build_object('assigned', v_total, 'completed', v_done,
    'pct', case when v_total = 0 then null else round(v_done * 100.0 / v_total, 1) end,
    'threshold', v_thr,
    'met', case when v_total = 0 then true else v_done * 100.0 / v_total >= v_thr end,
    'document_status', (select status from public.documents where id = pk.document_id));
end; $$;

-- Trainer worklist: what needs a package (documents held at the training gate)
-- and what could take a refresher (active documents), with the version to train.
create or replace function public.training_candidates()
returns jsonb language sql stable security definer set search_path = app, public as $$
  select coalesce(jsonb_agg(x order by x->>'status' desc, x->>'number'), '[]'::jsonb) from (
    select jsonb_build_object(
        'document_id', d.id, 'number', d.document_number, 'title', d.title, 'status', d.status,
        'version_id', v.id, 'revision', v.revision_number,
        'has_open_package', exists (select 1 from public.training_packages p
                                    where p.document_version_id = v.id and p.state <> 'closed')) as x
    from public.documents d
    join lateral (
      select id, revision_number from public.document_versions v
      where v.document_id = d.id
        and ((d.status = 'pending_training' and v.status = 'approved')
          or (d.status = 'active' and v.status = 'effective'))
      order by v.created_at desc limit 1) v on true
    where d.tenant_id = public.current_tenant_id()
      and d.status in ('pending_training','active')
      and app.is_trainer(auth.uid())) s;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'create_training_package(uuid,text,int,int)','store_ai_draft(uuid,jsonb,jsonb,text,text)',
    'log_ai_failure(uuid,text,text,text)',
    'update_training_slide(uuid,text,text)','add_training_slide(uuid,text,text)',
    'delete_training_slide(uuid)','reorder_training_slides(uuid,uuid[])',
    'update_training_question(uuid,text,jsonb,int,text)','add_training_question(uuid,text,jsonb,int,text)',
    'delete_training_question(uuid)','reorder_training_questions(uuid,uuid[])',
    'approve_training_package(uuid)','close_training_package(uuid,text)',
    'assign_training_package(uuid,uuid[],timestamptz)',
    'get_training_content(uuid)','save_training_progress(uuid,int)',
    'get_assessment(uuid)','submit_assessment(uuid,jsonb)',
    'verify_certificate(text)','my_training()','my_training_status(uuid)',
    'training_threshold_status(uuid)','training_candidates()']
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
grant execute on function app.version_training_met(uuid,uuid), app.training_pass_mark(uuid,uuid)
  to authenticated, service_role;
