-- ============================================================================
-- Document-Control Phase 3 — SOP Library module & Master Index (configurable)
-- The browsing EXPERIENCE over the core read surface. This is a MODULE: on/off +
-- config on the switchboard ('library' registered in Phase 2). The Master Index is
-- tenant-wide (A.4); the working view is a department FILTER, not a read wall. If
-- the module is off, reading still works via the core surface (D-READ) — the
-- effective-only listing is already enforced by the Phase 2 RLS, so the Library
-- adds presentation only and holds no authoritative document data.
-- ============================================================================

-- Category is metadata on the document (drives the library's category filter). The
-- taxonomy emerges from the values in use — no separate config surface needed.
alter table public.documents add column if not exists category text;

-- Per-user favorites (presentation only — a browse convenience, not a controlled action).
create table if not exists public.document_favorites (
  user_id     uuid not null references public.users(id),
  document_id uuid not null references public.documents(id),
  tenant_id   uuid not null references public.tenants(id),
  created_at  timestamptz not null default now(),
  primary key (user_id, document_id)
);
alter table public.document_favorites enable row level security;
alter table public.document_favorites force row level security;
drop policy if exists favorites_self on public.document_favorites;
create policy favorites_self on public.document_favorites for select to authenticated
  using (user_id = auth.uid());
grant select on public.document_favorites to authenticated;

-- Toggle a favorite for the current user. Derives tenant from the document.
create or replace function public.toggle_favorite(p_document uuid)
returns boolean language plpgsql security definer set search_path = app, public as $$
declare v_user uuid := auth.uid(); v_tenant uuid; v_exists boolean;
begin
  select tenant_id into v_tenant from public.documents where id = p_document;
  if v_tenant is null then raise exception 'toggle_favorite: no such document'; end if;
  if v_tenant <> public.current_tenant_id() then raise exception 'toggle_favorite: cross-tenant'; end if;

  select exists(select 1 from public.document_favorites where user_id=v_user and document_id=p_document)
    into v_exists;
  if v_exists then
    delete from public.document_favorites where user_id=v_user and document_id=p_document;
    return false;
  else
    insert into public.document_favorites(user_id, document_id, tenant_id) values (v_user, p_document, v_tenant);
    return true;
  end if;
end; $$;

revoke all on function public.toggle_favorite(uuid) from public;
grant execute on function public.toggle_favorite(uuid) to authenticated, service_role;
