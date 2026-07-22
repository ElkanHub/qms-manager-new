-- ============================================================================
-- Audit actor privacy — a platform-plane actor (owner / platform admin) that
-- acts on a tenant (enabling a module on the switchboard, a break-glass read)
-- correctly lands on the TENANT's audit chain, so the org sees the action. But
-- the org must never see the platform person's email — only that "Platform"
-- acted. This function lets an org-facing view confirm which of the emails it
-- ALREADY holds belong to platform-plane users, so those get masked to a neutral
-- label. It reveals no email the caller doesn't already have, and returns nothing
-- for org-plane actors.
-- ============================================================================

create or replace function public.platform_actor_emails(p_emails text[])
returns table(email text)
language sql stable security definer set search_path = public as $$
  select u.email from public.users u
  where u.email = any(coalesce(p_emails, '{}')) and u.plane = 'platform';
$$;

revoke all on function public.platform_actor_emails(text[]) from public;
grant execute on function public.platform_actor_emails(text[]) to authenticated, service_role;
