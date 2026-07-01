-- ============================================================================
-- Document-Control Phase 1 — Version store & document identity (the spine)
-- Separates the DOCUMENT (logical SOP, one identity for life) from its VERSIONS
-- (revisions that get drafted/effective/superseded/retained/destroyed). Identity
-- is a system-generated immutable id; the human number is METADATA (A.3). One
-- effective version per document (DB-enforced); supersession is atomic (§7.11).
-- Consumes the foundation: app.write_audit, current_tenant_id, freeze_tenant_id.
-- ============================================================================

-- ---- documents: the logical SOP (§10.1). Status is a thin lifecycle pointer. ----
create table if not exists public.documents (
  id                 uuid primary key default gen_random_uuid(),   -- system identity (immutable)
  tenant_id          uuid not null references public.tenants(id),
  org_id             uuid not null references public.organizations(id),
  department_id      uuid references public.departments(id),        -- owning dept
  document_number    text,                                          -- HUMAN metadata label (A.3); may be null/dup
  title              text not null,
  status             text not null default 'draft'
                     check (status in ('draft','in_review','pending_training','scheduled','active','locked_in_cc','retired')),
  current_version_id uuid,                                          -- FK added after versions table (circular)
  owner_id           uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column public.documents.id is 'System identity — immutable, never the human number. All internal refs key on this (A.3).';
comment on column public.documents.document_number is 'Human-facing metadata label only. Never identity. Duplicates allowed (migration).';

-- ---- document_versions: one row per revision, its own state set (§4.2, §10.2) ----
create table if not exists public.document_versions (
  id               uuid primary key default gen_random_uuid(),      -- system id
  document_id      uuid not null references public.documents(id),
  tenant_id        uuid not null references public.tenants(id),     -- denormalized for RLS/audit chain
  org_id           uuid not null references public.organizations(id),
  department_id    uuid references public.departments(id),
  revision_number  int,                                             -- allocated at EFFECTIVE time (§7.10); null in-flight
  status           text not null default 'draft'
                   check (status in ('draft','in_approval','approved','effective','superseded','retained','destroyed')),
  content_ref      text,                                            -- editable source pointer (workflow)
  effective_from   timestamptz,
  superseded_at    timestamptz,
  retention_until  timestamptz,                                     -- when destruction becomes permissible (Phase 8)
  reason_for_change text,
  created_by       uuid,
  created_at       timestamptz not null default now()
);

-- documents.current_version_id → the effective version (nullable while never-yet-effective).
alter table public.documents drop constraint if exists documents_current_version_fk;
alter table public.documents add constraint documents_current_version_fk
  foreign key (current_version_id) references public.document_versions(id);

-- THE one-effective-version invariant (A.1, §9): at most one effective version per document.
create unique index if not exists one_effective_version_per_document
  on public.document_versions (document_id) where status = 'effective';

create index if not exists document_versions_doc_idx on public.document_versions (document_id, created_at);
create index if not exists documents_tenant_status_idx on public.documents (tenant_id, status);

-- Immutable tenant_id on both (reuse foundation guard).
drop trigger if exists freeze_tenant_id on public.documents;
create trigger freeze_tenant_id before update on public.documents
  for each row execute function app.freeze_tenant_id();
drop trigger if exists freeze_tenant_id on public.document_versions;
create trigger freeze_tenant_id before update on public.document_versions
  for each row execute function app.freeze_tenant_id();

-- ---------------------------------------------------------------------------
-- RLS. Phase 1 baseline: tenant isolation (rule 0.2). The A.4 read model
-- (effective tenant-wide vs in-flight scoped) is refined in Phase 2/3. Writes go
-- only through the SECURITY DEFINER core RPCs below (rule 0.3).
-- ---------------------------------------------------------------------------
alter table public.documents          enable row level security;
alter table public.document_versions  enable row level security;
alter table public.documents          force row level security;
alter table public.document_versions  force row level security;

drop policy if exists documents_tenant_select on public.documents;
create policy documents_tenant_select on public.documents for select to authenticated
  using (tenant_id = public.current_tenant_id());
drop policy if exists versions_tenant_select on public.document_versions;
create policy versions_tenant_select on public.document_versions for select to authenticated
  using (tenant_id = public.current_tenant_id());

grant select on public.documents, public.document_versions to authenticated;

-- ---------------------------------------------------------------------------
-- Legal version-state edges. Illegal transitions are unrepresentable (§1.2).
-- →effective is special (atomic supersession) and goes through make_effective(),
-- never this generic mover.
-- ---------------------------------------------------------------------------
create or replace function app.version_can_transition(p_from text, p_to text) returns boolean
language sql immutable as $$
  select (p_from, p_to) in (
    ('draft','in_approval'),
    ('in_approval','approved'),
    ('in_approval','draft'),      -- changes requested
    ('approved','draft'),         -- rejected back to draft (history preserved)
    ('superseded','retained'),    -- retention (Phase 8)
    ('effective','retained'),     -- retirement of a live doc (Phase 8)
    ('retained','destroyed')      -- time-gated destruction (Phase 8)
  );
$$;

-- Generic guarded state write for NON-effective edges. Audited. Role/SoD guards
-- are layered by the workflow phases (6-8) that wrap this.
create or replace function app.transition_version(
  p_version uuid, p_to text, p_actor uuid, p_reason text default null, p_source text default null)
returns void
language plpgsql security definer set search_path = app, public as $$
declare v public.document_versions;
begin
  select * into v from public.document_versions where id = p_version for update;
  if v.id is null then raise exception 'transition_version: no such version'; end if;
  if p_to = 'effective' then
    raise exception 'transition_version: use make_effective() for the atomic effective transition';
  end if;
  if not app.version_can_transition(v.status, p_to) then
    raise exception 'transition_version: illegal transition % -> %', v.status, p_to;
  end if;
  update public.document_versions set status = p_to where id = p_version;
  perform app.write_audit('version.'||p_to, p_actor, null, v.tenant_id, v.org_id, v.department_id,
    'document_version', p_version::text, jsonb_build_object('status', v.status),
    jsonb_build_object('status', p_to), p_reason, p_source);
end; $$;

-- ---------------------------------------------------------------------------
-- create_document — mints a new logical document (system id) + its first draft
-- version. The human number is metadata, independent of identity.
-- ---------------------------------------------------------------------------
create or replace function app.create_document(
  p_tenant uuid, p_org uuid, p_department uuid, p_title text, p_number text,
  p_owner uuid, p_actor uuid, p_content_ref text default null, p_reason text default null,
  p_source text default null)
returns table(document_id uuid, version_id uuid)
language plpgsql security definer set search_path = app, public as $$
declare v_doc uuid; v_ver uuid;
begin
  if p_title is null or length(trim(p_title)) = 0 then raise exception 'create_document: title required'; end if;
  insert into public.documents(tenant_id, org_id, department_id, document_number, title, status, owner_id)
    values (p_tenant, p_org, p_department, p_number, p_title, 'draft', p_owner) returning id into v_doc;
  insert into public.document_versions(document_id, tenant_id, org_id, department_id, status, content_ref, reason_for_change, created_by)
    values (v_doc, p_tenant, p_org, p_department, 'draft', p_content_ref, p_reason, p_actor) returning id into v_ver;

  perform app.write_audit('document.created', p_actor, null, p_tenant, p_org, p_department,
    'document', v_doc::text, null, jsonb_build_object('title', p_title, 'number', p_number), p_reason, p_source);
  perform app.write_audit('version.created', p_actor, null, p_tenant, p_org, p_department,
    'document_version', v_ver::text, null, jsonb_build_object('status','draft'), p_reason, p_source);
  document_id := v_doc; version_id := v_ver; return next;
end; $$;

-- Add a new draft revision to an existing document (for a change). Reuses identity.
create or replace function app.add_revision(
  p_document uuid, p_actor uuid, p_content_ref text default null, p_reason text default null, p_source text default null)
returns uuid
language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v_ver uuid;
begin
  select * into d from public.documents where id = p_document;
  if d.id is null then raise exception 'add_revision: no such document'; end if;
  insert into public.document_versions(document_id, tenant_id, org_id, department_id, status, content_ref, reason_for_change, created_by)
    values (p_document, d.tenant_id, d.org_id, d.department_id, 'draft', p_content_ref, p_reason, p_actor) returning id into v_ver;
  perform app.write_audit('version.created', p_actor, null, d.tenant_id, d.org_id, d.department_id,
    'document_version', v_ver::text, null, jsonb_build_object('status','draft','document', p_document), p_reason, p_source);
  return v_ver;
end; $$;

-- ---------------------------------------------------------------------------
-- make_effective — THE atomic supersession primitive (§7.11). In one transaction:
-- supersede the current effective version (if any), then make the successor
-- effective and allocate its revision number. Ordered so there is never, even
-- transiently, two effective versions (the unique index would reject that).
-- ---------------------------------------------------------------------------
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

  -- (1) Supersede the current effective version FIRST → zero effective momentarily.
  select * into v_prev from public.document_versions
    where document_id = v.document_id and status = 'effective' for update;
  if v_prev.id is not null then
    update public.document_versions set status = 'superseded', superseded_at = p_effective_from
      where id = v_prev.id;
    perform app.write_audit('version.superseded', p_actor, null, v_prev.tenant_id, v_prev.org_id, v_prev.department_id,
      'document_version', v_prev.id::text, jsonb_build_object('status','effective'),
      jsonb_build_object('status','superseded'), null, p_source);
  end if;

  -- (2) Allocate revision (00, 01, …) at effective time and make successor effective.
  select coalesce(max(revision_number), -1) + 1 into v_rev
    from public.document_versions where document_id = v.document_id;
  update public.document_versions
    set status = 'effective', effective_from = p_effective_from, revision_number = v_rev
    where id = v.id;
  update public.documents
    set status = 'active', current_version_id = v.id, updated_at = now()
    where id = v.document_id;

  perform app.write_audit('version.effective', p_actor, null, v.tenant_id, v.org_id, v.department_id,
    'document_version', v.id::text, jsonb_build_object('status','approved'),
    jsonb_build_object('status','effective','revision', v_rev), null, p_source);
  return v_rev;
end; $$;

-- ---------------------------------------------------------------------------
-- History: which version was effective on a given date (§9). Retrievable from
-- effective_from / superseded_at alone.
-- ---------------------------------------------------------------------------
create or replace function app.version_effective_on(p_document uuid, p_at timestamptz)
returns uuid
language sql stable security definer set search_path = app, public as $$
  select id from public.document_versions
  where document_id = p_document
    and effective_from is not null and effective_from <= p_at
    and (superseded_at is null or superseded_at > p_at)
  order by effective_from desc limit 1;
$$;

grant execute on function app.create_document(uuid,uuid,uuid,text,text,uuid,uuid,text,text,text),
  app.add_revision(uuid,uuid,text,text,text),
  app.transition_version(uuid,text,uuid,text,text),
  app.make_effective(uuid,uuid,timestamptz,text),
  app.version_effective_on(uuid,timestamptz)
  to service_role;
