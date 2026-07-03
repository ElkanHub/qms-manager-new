-- ============================================================================
-- SOP Library v2 — SOP_LIBRARY_MODULE_BUILD_PLAN + the per-document lock
-- decision: default remains FULL company-wide read of effective documents
-- (the settled A.4 model); QA may LOCK individual documents. A locked
-- document still shows on the Master Index ("it exists"), but opening it
-- requires an access request that QA grants WITH A TIME LIMIT — when the
-- grant expires the door closes again by itself. Every step is on the chain:
-- lock, unlock, request, grant (with its expiry), decline, revoke, every
-- restricted read, and every denied attempt.
--
-- Also: tenant-configurable categories (taxonomy as data), and library_config
-- for presentation defaults. The library stays a shell — it owns no document
-- data; reading survives the module being off (locks are CORE enforcement in
-- read_document, module state does not weaken them).
-- ============================================================================

-- ---- Categories (per-tenant taxonomy) ----
create table if not exists public.library_categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id),
  name       text not null,
  sort_order int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists library_categories_name_unique
  on public.library_categories (tenant_id, lower(name));
alter table public.library_categories enable row level security;
alter table public.library_categories force row level security;
drop policy if exists library_categories_read on public.library_categories;
create policy library_categories_read on public.library_categories for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.library_categories to authenticated;

create table if not exists public.document_categories (
  document_id uuid not null references public.documents(id),
  category_id uuid not null references public.library_categories(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id),
  primary key (document_id, category_id)
);
alter table public.document_categories enable row level security;
alter table public.document_categories force row level security;
drop policy if exists document_categories_read on public.document_categories;
create policy document_categories_read on public.document_categories for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.document_categories to authenticated;

create or replace function public.upsert_library_category(p_name text, p_sort int default 0, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_id uuid; begin
  select * into v_ctx from app.actor_context(v_caller);
  if not (app.is_qa(v_caller) or app.has_role(v_caller, 'org_admin')) then
    raise exception 'upsert_library_category: QA or org admin only'; end if;
  if length(trim(coalesce(p_name,''))) = 0 then
    raise exception 'upsert_library_category: a name is required'; end if;
  if p_id is not null then
    update public.library_categories set name = trim(p_name), sort_order = coalesce(p_sort, 0)
      where id = p_id and tenant_id = v_ctx.tenant_id returning id into v_id;
    if v_id is null then raise exception 'upsert_library_category: no such category'; end if;
  else
    insert into public.library_categories(tenant_id, name, sort_order, created_by)
      values (v_ctx.tenant_id, trim(p_name), coalesce(p_sort, 0), v_caller) returning id into v_id;
  end if;
  perform app.write_audit('library.category_saved', v_caller, null, v_ctx.tenant_id, v_ctx.org_id, null,
    'library_category', v_id::text, null, jsonb_build_object('name', trim(p_name), 'sort', p_sort), null, 'L-CONFIG');
  return v_id;
end; $$;

create or replace function public.delete_library_category(p_id uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_name text; begin
  select * into v_ctx from app.actor_context(v_caller);
  if not (app.is_qa(v_caller) or app.has_role(v_caller, 'org_admin')) then
    raise exception 'delete_library_category: QA or org admin only'; end if;
  delete from public.library_categories where id = p_id and tenant_id = v_ctx.tenant_id
    returning name into v_name;
  if v_name is null then raise exception 'delete_library_category: no such category'; end if;
  perform app.write_audit('library.category_deleted', v_caller, null, v_ctx.tenant_id, v_ctx.org_id, null,
    'library_category', p_id::text, jsonb_build_object('name', v_name), null, null, 'L-CONFIG');
end; $$;

create or replace function public.set_document_categories(p_document uuid, p_category_ids uuid[])
returns void language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v_caller uuid := auth.uid(); begin
  select * into d from public.documents where id = p_document;
  if d.id is null or d.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'set_document_categories: no such document'; end if;
  if not (app.is_qa(v_caller) or app.has_role(v_caller, 'org_admin')) then
    raise exception 'set_document_categories: QA or org admin only'; end if;
  delete from public.document_categories where document_id = p_document;
  insert into public.document_categories(document_id, category_id, tenant_id)
    select p_document, c.id, d.tenant_id from public.library_categories c
    where c.tenant_id = d.tenant_id and c.id = any(coalesce(p_category_ids, '{}'));
  perform app.write_audit('library.document_categorized', v_caller, null, d.tenant_id, d.org_id, d.department_id,
    'document', p_document::text, null, jsonb_build_object('categories', p_category_ids), null, 'L-CONFIG');
end; $$;

-- ---- Library presentation config (per tenant) ----
create table if not exists public.library_config (
  tenant_id  uuid primary key references public.tenants(id),
  settings   jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.library_config enable row level security;
alter table public.library_config force row level security;
drop policy if exists library_config_read on public.library_config;
create policy library_config_read on public.library_config for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.library_config to authenticated;

create or replace function public.set_library_config(p_settings jsonb)
returns void language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_old jsonb; begin
  select * into v_ctx from app.actor_context(v_caller);
  if not (app.is_qa(v_caller) or app.has_role(v_caller, 'org_admin')) then
    raise exception 'set_library_config: QA or org admin only'; end if;
  select settings into v_old from public.library_config where tenant_id = v_ctx.tenant_id;
  insert into public.library_config(tenant_id, settings, updated_by, updated_at)
    values (v_ctx.tenant_id, coalesce(p_settings, '{}'::jsonb), v_caller, now())
    on conflict (tenant_id) do update set settings = excluded.settings, updated_by = v_caller, updated_at = now();
  perform app.write_audit('library.config_set', v_caller, null, v_ctx.tenant_id, v_ctx.org_id, null,
    'library_config', v_ctx.tenant_id::text, v_old, p_settings, null, 'L-CONFIG');
end; $$;

-- ---- Per-document locks (QA) ----
create table if not exists public.document_locks (
  document_id uuid primary key references public.documents(id),
  tenant_id   uuid not null references public.tenants(id),
  locked_by   uuid not null,
  reason      text not null,
  locked_at   timestamptz not null default now()
);
alter table public.document_locks enable row level security;
alter table public.document_locks force row level security;
drop policy if exists document_locks_read on public.document_locks;
create policy document_locks_read on public.document_locks for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.document_locks to authenticated;

-- ---- Access requests with TIMED grants ----
create table if not exists public.read_access_requests (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id),
  document_id    uuid not null references public.documents(id),
  requester_id   uuid not null,
  purpose        text not null,
  state          text not null default 'requested'
                 check (state in ('requested','declined','granted','revoked')),
  decided_by     uuid,
  decided_at     timestamptz,
  decline_reason text,
  expires_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists read_access_doc_idx on public.read_access_requests (document_id, requester_id, state);
alter table public.read_access_requests enable row level security;
alter table public.read_access_requests force row level security;
drop policy if exists read_access_read on public.read_access_requests;
create policy read_access_read on public.read_access_requests for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.read_access_requests to authenticated;

-- Who can open a document's content: unlocked → everyone in the tenant (A.4);
-- locked → QA/org_admin, the document's own department, or an UNEXPIRED grant.
-- Expiry needs no scheduler — the moment expires_at passes, this answers false.
create or replace function app.can_read_document(p_user uuid, p_document uuid) returns boolean
language sql stable security definer set search_path = app, public as $$
  select case
    when not exists (select 1 from public.document_locks where document_id = p_document) then true
    when app.is_qa(p_user) or app.has_role(p_user, 'org_admin') then true
    when exists (select 1 from public.documents d join public.users u on u.department_id = d.department_id
                 where d.id = p_document and u.id = p_user) then true
    when exists (select 1 from public.read_access_requests r
                 where r.document_id = p_document and r.requester_id = p_user
                   and r.state = 'granted' and r.expires_at > now()) then true
    else false end;
$$;
grant execute on function app.can_read_document(uuid, uuid) to authenticated, service_role;

create or replace function public.lock_document(p_document uuid, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v_caller uuid := auth.uid(); begin
  select * into d from public.documents where id = p_document;
  if d.id is null or d.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'lock_document: no such document'; end if;
  if not app.is_qa(v_caller) then raise exception 'lock_document: QA only'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'lock_document: a reason is required'; end if;
  insert into public.document_locks(document_id, tenant_id, locked_by, reason)
    values (p_document, d.tenant_id, v_caller, trim(p_reason))
    on conflict (document_id) do nothing;
  perform app.write_audit('document.locked', v_caller, null, d.tenant_id, d.org_id, d.department_id,
    'document', p_document::text, null, jsonb_build_object('locked', true), trim(p_reason), 'L-LOCKS');
end; $$;

create or replace function public.unlock_document(p_document uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v_caller uuid := auth.uid(); begin
  select * into d from public.documents where id = p_document;
  if d.id is null or d.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'unlock_document: no such document'; end if;
  if not app.is_qa(v_caller) then raise exception 'unlock_document: QA only'; end if;
  delete from public.document_locks where document_id = p_document;
  perform app.write_audit('document.unlocked', v_caller, null, d.tenant_id, d.org_id, d.department_id,
    'document', p_document::text, jsonb_build_object('locked', true), jsonb_build_object('locked', false),
    null, 'L-LOCKS');
end; $$;

create or replace function public.request_read_access(p_document uuid, p_purpose text)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v_caller uuid := auth.uid(); v_ctx record; v_id uuid; begin
  select * into v_ctx from app.actor_context(v_caller);
  select * into d from public.documents where id = p_document;
  if d.id is null or d.tenant_id is distinct from v_ctx.tenant_id then
    raise exception 'request_read_access: no such document'; end if;
  if app.can_read_document(v_caller, p_document) then
    raise exception 'request_read_access: you can already read this document'; end if;
  if length(trim(coalesce(p_purpose,''))) = 0 then
    raise exception 'request_read_access: a purpose is required'; end if;
  if exists (select 1 from public.read_access_requests
             where document_id = p_document and requester_id = v_caller and state = 'requested') then
    raise exception 'request_read_access: your request is already with QA'; end if;
  insert into public.read_access_requests(tenant_id, document_id, requester_id, purpose)
    values (d.tenant_id, p_document, v_caller, trim(p_purpose)) returning id into v_id;
  perform app.write_audit('read_access.requested', v_caller, null, d.tenant_id, d.org_id, d.department_id,
    'read_access_request', v_id::text, null, jsonb_build_object('document', p_document),
    trim(p_purpose), 'L-LOCKS');
  return v_id;
end; $$;

create or replace function public.grant_read_access(p_request uuid, p_hours int)
returns void language plpgsql security definer set search_path = app, public as $$
declare r public.read_access_requests; d public.documents; v_caller uuid := auth.uid(); v_until timestamptz; begin
  select * into r from public.read_access_requests where id = p_request for update;
  if r.id is null or r.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'grant_read_access: no such request'; end if;
  if not app.is_qa(v_caller) then raise exception 'grant_read_access: QA only'; end if;
  if r.state <> 'requested' then raise exception 'grant_read_access: already decided'; end if;
  if coalesce(p_hours, 0) not between 1 and 8760 then
    raise exception 'grant_read_access: the time limit must be between 1 hour and 1 year'; end if;
  v_until := now() + make_interval(hours => p_hours);
  update public.read_access_requests
    set state='granted', decided_by=v_caller, decided_at=now(), expires_at=v_until
    where id = p_request;
  select * into d from public.documents where id = r.document_id;
  perform app.write_audit('read_access.granted', v_caller, null, r.tenant_id, d.org_id, d.department_id,
    'read_access_request', p_request::text, jsonb_build_object('state','requested'),
    jsonb_build_object('state','granted','expires_at', v_until, 'hours', p_hours,
                       'requester', r.requester_id), null, 'L-LOCKS');
end; $$;

create or replace function public.decline_read_access(p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare r public.read_access_requests; d public.documents; v_caller uuid := auth.uid(); begin
  select * into r from public.read_access_requests where id = p_request for update;
  if r.id is null or r.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'decline_read_access: no such request'; end if;
  if not app.is_qa(v_caller) then raise exception 'decline_read_access: QA only'; end if;
  if r.state <> 'requested' then raise exception 'decline_read_access: already decided'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'decline_read_access: a reason is required'; end if;
  update public.read_access_requests
    set state='declined', decided_by=v_caller, decided_at=now(), decline_reason=trim(p_reason)
    where id = p_request;
  select * into d from public.documents where id = r.document_id;
  perform app.write_audit('read_access.declined', v_caller, null, r.tenant_id, d.org_id, d.department_id,
    'read_access_request', p_request::text, jsonb_build_object('state','requested'),
    jsonb_build_object('state','declined'), trim(p_reason), 'L-LOCKS');
end; $$;

create or replace function public.revoke_read_access(p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = app, public as $$
declare r public.read_access_requests; d public.documents; v_caller uuid := auth.uid(); begin
  select * into r from public.read_access_requests where id = p_request for update;
  if r.id is null or r.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'revoke_read_access: no such request'; end if;
  if not app.is_qa(v_caller) then raise exception 'revoke_read_access: QA only'; end if;
  if r.state <> 'granted' then raise exception 'revoke_read_access: not an active grant'; end if;
  if length(trim(coalesce(p_reason,''))) = 0 then raise exception 'revoke_read_access: a reason is required'; end if;
  update public.read_access_requests
    set state='revoked', decided_by=v_caller, decided_at=now(), expires_at=now()
    where id = p_request;
  select * into d from public.documents where id = r.document_id;
  perform app.write_audit('read_access.revoked', v_caller, null, r.tenant_id, d.org_id, d.department_id,
    'read_access_request', p_request::text, jsonb_build_object('state','granted'),
    jsonb_build_object('state','revoked'), trim(p_reason), 'L-LOCKS');
end; $$;

-- ---- read_document v2: the lock bites at the CORE read surface ----
-- (Enforcement, not presentation: the library module being off never weakens
-- this.) A restricted read via a live grant is ALWAYS audited; a denied
-- attempt is audited too — the whole story is on the chain.
create or replace function public.read_document(p_document uuid)
returns table(version_id uuid, revision_number int, title text, document_number text,
              effective_from timestamptz, renderer text, rendition_ref text)
language plpgsql security definer set search_path = app, public as $$
declare d public.documents; v public.document_versions; v_locked boolean;
begin
  select * into d from public.documents where id = p_document;
  if d.id is null then raise exception 'read_document: no such document'; end if;
  if d.tenant_id <> public.current_tenant_id() then
    raise exception 'read_document: cross-tenant read denied';   -- A.4 is tenant-wide, not cross-tenant
  end if;

  -- Restricted → log the denied attempt and return NO ROWS (raising would
  -- roll the log back with it; an empty result is the refusal, and the audit
  -- entry survives). Callers distinguish this from a missing document, which
  -- still raises above.
  v_locked := exists (select 1 from public.document_locks where document_id = p_document);
  if v_locked and not app.can_read_document(auth.uid(), p_document) then
    perform app.write_audit('read_access.denied_attempt', auth.uid(), null, d.tenant_id, d.org_id, d.department_id,
      'document', p_document::text, null, null, null, 'L-LOCKS');
    return;
  end if;

  select * into v from public.document_versions where document_id = p_document and status = 'effective';
  if v.id is null then raise exception 'read_document: no effective version'; end if;  -- in-flight never served here

  if v_locked then
    perform app.write_audit('document.restricted_read', auth.uid(), null, d.tenant_id, d.org_id, d.department_id,
      'document_version', v.id::text, null, null, null, 'L-LOCKS');
  elsif app.read_tracking_enabled(d.tenant_id) then
    perform app.write_audit('document.read', auth.uid(), null, d.tenant_id, d.org_id, d.department_id,
      'document_version', v.id::text, null, null, null, 'D-READ');
  end if;

  version_id := v.id; revision_number := v.revision_number; title := d.title;
  document_number := d.document_number; effective_from := v.effective_from;
  renderer := app.resolve_renderer(d.tenant_id); rendition_ref := v.rendition_ref;
  return next;
end; $$;

do $$ declare fn text; begin
  foreach fn in array array[
    'upsert_library_category(text,int,uuid)','delete_library_category(uuid)',
    'set_document_categories(uuid,uuid[])','set_library_config(jsonb)',
    'lock_document(uuid,text)','unlock_document(uuid)',
    'request_read_access(uuid,text)','grant_read_access(uuid,int)',
    'decline_read_access(uuid,text)','revoke_read_access(uuid,text)']
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
