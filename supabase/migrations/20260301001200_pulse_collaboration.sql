-- ============================================================================
-- Collaboration trio — PULSE, BROADCASTS, MESSAGES (one right sidebar).
--
--   PULSE — the app's heartbeat. Anything that needs a user's attention lands
--   as a notification row: endorsements/QA reviews waiting for their role,
--   changes requested on their draft, a new effective revision in their
--   department, training assigned, copy/access requests and their decisions.
--   Event seams are TRIGGERS on the core tables — new engine features get
--   pulse coverage by the same pattern without rewriting shipped RPCs.
--
--   BROADCASTS — announcements requiring acknowledgement. HODs send to their
--   own department; QA/org-admins to one department or the whole company.
--   Senders see acknowledged-of-total; receivers act. Send + ack are AUDITED
--   (chat is not — it is not a controlled action; the chain stays clean).
--
--   MESSAGES — 1:1 chat, every org member a contact, SOP tagging.
--
--   All three are switchboard modules (category: collaboration). Off → the
--   sidebar hides them, app.notify no-ops, senders are refused, and nothing
--   in the core flow changes (safe defaults).
-- ============================================================================

-- ---- Switchboard registration ----
alter table public.modules drop constraint if exists modules_category_check;
alter table public.modules add constraint modules_category_check
  check (category in ('document_control','ai','quality','collaboration'));
insert into public.modules (key, label, description, audit_compliant, category, sort_order, upcoming) values
  ('pulse', 'Pulse', 'The heartbeat: everything needing a user''s attention, in one feed with unread badges.', true, 'collaboration', 1, false),
  ('broadcasts', 'Broadcasts', 'Acknowledged announcements — department or company-wide, with ack tracking for the sender.', true, 'collaboration', 2, false),
  ('messages', 'Messages', 'In-app 1:1 chat between org members, with SOP tagging.', true, 'collaboration', 3, false)
on conflict (key) do update
  set category = excluded.category, sort_order = excluded.sort_order,
      upcoming = excluded.upcoming, description = excluded.description;

-- ---- PULSE: notifications ----
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id),
  user_id    uuid not null references public.users(id),
  kind       text not null,
  title      text not null,
  body       text,
  href       text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notifications_user_unread_idx on public.notifications (user_id, read_at, created_at desc);
alter table public.notifications enable row level security;
alter table public.notifications force row level security;
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
grant select on public.notifications to authenticated;

-- Directory helpers for the event seams.
create or replace function app.role_holders(p_tenant uuid, p_role text, p_department uuid default null)
returns setof uuid language sql stable security definer set search_path = app, public as $$
  select distinct ur.user_id from public.user_roles ur
  join public.users u on u.id = ur.user_id and u.status = 'active'
  where ur.tenant_id = p_tenant and ur.role = p_role
    and (p_department is null or ur.department_id is null or ur.department_id = p_department);
$$;
create or replace function app.department_users(p_department uuid)
returns setof uuid language sql stable security definer set search_path = app, public as $$
  select id from public.users where department_id = p_department and status = 'active';
$$;

-- The one notifier. Module off → silent no-op (the flow never depends on it).
create or replace function app.notify(
  p_tenant uuid, p_users uuid[], p_kind text, p_title text,
  p_body text default null, p_href text default null)
returns void language plpgsql security definer set search_path = app, public as $$
begin
  if not app.module_enabled(p_tenant, 'pulse') then return; end if;
  insert into public.notifications(tenant_id, user_id, kind, title, body, href)
  select p_tenant, u, p_kind, p_title, p_body, p_href
  from unnest(coalesce(p_users, '{}')) as u
  where u is not null;
end; $$;

create or replace function public.mark_notification_read(p_id uuid)
returns void language sql security definer set search_path = app, public as $$
  update public.notifications set read_at = now()
  where id = p_id and user_id = auth.uid() and read_at is null;
$$;
create or replace function public.mark_all_notifications_read()
returns void language sql security definer set search_path = app, public as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null;
$$;

-- ---- Event seams (triggers on the core) ----
create or replace function app.pulse_on_approval_request() returns trigger
language plpgsql security definer set search_path = app, public as $$
declare d record;
begin
  select document_number, title into d from public.documents where id = new.document_id;
  if tg_op = 'INSERT' then
    if new.stage = 'hod_review' then
      perform app.notify(new.tenant_id,
        array(select app.role_holders(new.tenant_id, 'hod', new.department_id)
              except select new.submitted_by),
        'endorsement', 'Endorsement needed',
        coalesce(d.document_number || ' · ', '') || coalesce(d.title, 'A draft') || ' awaits your endorsement.',
        '/queues/endorse');
    elsif new.stage = 'qa_review' then
      perform app.notify(new.tenant_id,
        array(select app.role_holders(new.tenant_id, 'qa') except select new.submitted_by),
        'qa_review', 'QA review needed',
        coalesce(d.document_number || ' · ', '') || coalesce(d.title, 'A draft') || ' awaits QA review.',
        '/queues/qa-review');
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'changes_requested' and old.status <> 'changes_requested' then
    perform app.notify(new.tenant_id, array[new.submitted_by],
      'changes_requested', 'Changes requested on your draft',
      coalesce(d.title, 'Your draft') || ': ' || coalesce(new.reason, 'see the anchored review comments.'),
      '/documents/' || new.document_id || '/draft');
  end if;
  return new;
end; $$;
drop trigger if exists pulse_approval on public.approval_requests;
create trigger pulse_approval after insert or update of status on public.approval_requests
  for each row execute function app.pulse_on_approval_request();

create or replace function app.pulse_on_training_assignment() returns trigger
language plpgsql security definer set search_path = app, public as $$
declare d record;
begin
  select document_number, title into d from public.documents where id = new.document_id;
  perform app.notify(new.tenant_id, array[new.user_id],
    'training', 'Training assigned',
    'You have been assigned training' || coalesce(' on ' || d.document_number || ' · ' || d.title, '') || '.',
    '/training');
  return new;
end; $$;
drop trigger if exists pulse_training on public.training_assignments;
create trigger pulse_training after insert on public.training_assignments
  for each row execute function app.pulse_on_training_assignment();

create or replace function app.pulse_on_effective() returns trigger
language plpgsql security definer set search_path = app, public as $$
declare d record;
begin
  if new.status = 'effective' and old.status is distinct from 'effective' then
    select document_number, title into d from public.documents where id = new.document_id;
    perform app.notify(new.tenant_id,
      array(select app.department_users(new.department_id)),
      'effective', 'New effective revision',
      coalesce(d.document_number || ' · ', '') || coalesce(d.title, 'A document') ||
        ' is now effective (rev ' || lpad(coalesce(new.revision_number,0)::text, 2, '0') || ').',
      '/documents/' || new.document_id);
  end if;
  return new;
end; $$;
drop trigger if exists pulse_effective on public.document_versions;
create trigger pulse_effective after update of status on public.document_versions
  for each row execute function app.pulse_on_effective();

create or replace function app.pulse_on_copy_request() returns trigger
language plpgsql security definer set search_path = app, public as $$
begin
  if tg_op = 'INSERT' then
    perform app.notify(new.tenant_id,
      array(select app.role_holders(new.tenant_id, 'qa') except select new.requester_id),
      'copy_request', 'Copy request awaiting decision',
      initcap(new.copy_type) || ' copy requested → ' || new.destination || '.', '/copies');
  elsif tg_op = 'UPDATE' and new.state in ('fulfilled','declined') and old.state = 'requested' then
    perform app.notify(new.tenant_id, array[new.requester_id],
      'copy_decision', 'Your copy request was ' || new.state,
      case when new.state = 'declined' then coalesce(new.decline_reason, '') else 'The copies are on the register.' end,
      '/copies');
  end if;
  return new;
end; $$;
drop trigger if exists pulse_copy_requests on public.copy_requests;
create trigger pulse_copy_requests after insert or update of state on public.copy_requests
  for each row execute function app.pulse_on_copy_request();

create or replace function app.pulse_on_read_access() returns trigger
language plpgsql security definer set search_path = app, public as $$
declare d record;
begin
  select document_number, title into d from public.documents where id = new.document_id;
  if tg_op = 'INSERT' then
    perform app.notify(new.tenant_id,
      array(select app.role_holders(new.tenant_id, 'qa') except select new.requester_id),
      'access_request', 'Read-access request awaiting decision',
      coalesce(d.document_number || ' · ', '') || coalesce(d.title, 'a restricted document') || '.',
      '/library/config');
  elsif tg_op = 'UPDATE' and new.state in ('granted','declined','revoked') and new.state is distinct from old.state then
    perform app.notify(new.tenant_id, array[new.requester_id],
      'access_decision', 'Your access request was ' || new.state,
      case when new.state = 'granted' then 'Access until ' || to_char(new.expires_at, 'DD Mon YYYY HH24:MI') || '.'
           else coalesce(new.decline_reason, '') end,
      '/documents/' || new.document_id);
  end if;
  return new;
end; $$;
drop trigger if exists pulse_read_access on public.read_access_requests;
create trigger pulse_read_access after insert or update of state on public.read_access_requests
  for each row execute function app.pulse_on_read_access();

-- ---- BROADCASTS ----
create table if not exists public.broadcasts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  org_id        uuid,
  sender_id     uuid not null references public.users(id),
  department_id uuid references public.departments(id),   -- null = entire company
  title         text not null,
  body          text not null,
  created_at    timestamptz not null default now()
);
create index if not exists broadcasts_tenant_idx on public.broadcasts (tenant_id, created_at desc);
alter table public.broadcasts enable row level security;
alter table public.broadcasts force row level security;
drop policy if exists broadcasts_read on public.broadcasts;
create policy broadcasts_read on public.broadcasts for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and (department_id is null
              or sender_id = auth.uid()
              or department_id = (select department_id from public.users where id = auth.uid())
              or app.is_qa(auth.uid())));
grant select on public.broadcasts to authenticated;

create table if not exists public.broadcast_acks (
  broadcast_id uuid not null references public.broadcasts(id),
  user_id      uuid not null references public.users(id),
  tenant_id    uuid not null references public.tenants(id),
  acked_at     timestamptz not null default now(),
  primary key (broadcast_id, user_id)
);
alter table public.broadcast_acks enable row level security;
alter table public.broadcast_acks force row level security;
drop policy if exists broadcast_acks_read on public.broadcast_acks;
create policy broadcast_acks_read on public.broadcast_acks for select to authenticated
  using (tenant_id = public.current_tenant_id());
grant select on public.broadcast_acks to authenticated;

-- Who a broadcast concerns (for counts and ack rights): the department's
-- active users, or the whole tenant when department is null. Sender excluded —
-- you don't acknowledge your own announcement.
create or replace function app.broadcast_audience(p_broadcast uuid)
returns setof uuid language sql stable security definer set search_path = app, public as $$
  select u.id from public.broadcasts b
  join public.users u on u.tenant_id = b.tenant_id and u.status = 'active' and u.plane = 'org'
  where b.id = p_broadcast
    and (b.department_id is null or u.department_id = b.department_id)
    and u.id <> b.sender_id;
$$;
grant execute on function app.broadcast_audience(uuid) to authenticated, service_role;

create or replace function public.send_broadcast(p_title text, p_body text, p_department uuid default null)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_id uuid; begin
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'send_broadcast: not an org user'; end if;
  if not app.module_enabled(v_ctx.tenant_id, 'broadcasts') then
    raise exception 'send_broadcast: the broadcasts module is off'; end if;
  if length(trim(coalesce(p_title,''))) = 0 or length(trim(coalesce(p_body,''))) = 0 then
    raise exception 'send_broadcast: a title and a message are required'; end if;

  -- Authority: QA/org-admin → any department or company-wide (null);
  -- HOD → their OWN department only.
  if app.is_qa(v_caller) or app.has_role(v_caller, 'org_admin') then
    null; -- any scope
  elsif p_department is not null and app.has_role(v_caller, 'hod', p_department) then
    null; -- own department
  else
    raise exception 'send_broadcast: HODs broadcast to their own department; QA/org admins to a department or the whole company';
  end if;
  if p_department is not null and not exists (
      select 1 from public.departments where id = p_department and tenant_id = v_ctx.tenant_id) then
    raise exception 'send_broadcast: no such department'; end if;

  insert into public.broadcasts(tenant_id, org_id, sender_id, department_id, title, body)
    values (v_ctx.tenant_id, v_ctx.org_id, v_caller, p_department, trim(p_title), trim(p_body))
    returning id into v_id;
  perform app.write_audit('broadcast.sent', v_caller, null, v_ctx.tenant_id, v_ctx.org_id, p_department,
    'broadcast', v_id::text, null,
    jsonb_build_object('title', trim(p_title), 'scope',
      case when p_department is null then 'company' else 'department' end),
    null, 'D-BROADCAST');
  return v_id;
end; $$;

create or replace function public.acknowledge_broadcast(p_broadcast uuid)
returns void language plpgsql security definer set search_path = app, public as $$
declare b public.broadcasts; v_caller uuid := auth.uid(); begin
  select * into b from public.broadcasts where id = p_broadcast;
  if b.id is null or b.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'acknowledge_broadcast: no such broadcast'; end if;
  if not exists (select 1 from app.broadcast_audience(p_broadcast) a where a = v_caller) then
    raise exception 'acknowledge_broadcast: this announcement does not concern you'; end if;
  insert into public.broadcast_acks(broadcast_id, user_id, tenant_id)
    values (p_broadcast, v_caller, b.tenant_id)
    on conflict (broadcast_id, user_id) do nothing;
  perform app.write_audit('broadcast.acknowledged', v_caller, null, b.tenant_id, b.org_id, b.department_id,
    'broadcast', p_broadcast::text, null, jsonb_build_object('title', b.title), null, 'D-BROADCAST');
end; $$;

-- ---- MESSAGES (1:1) ----
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id),
  user_a     uuid not null references public.users(id),
  user_b     uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (tenant_id, user_a, user_b)
);
alter table public.conversations enable row level security;
alter table public.conversations force row level security;
drop policy if exists conversations_own on public.conversations;
create policy conversations_own on public.conversations for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());
grant select on public.conversations to authenticated;

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id),
  tenant_id       uuid not null references public.tenants(id),
  sender_id       uuid not null references public.users(id),
  body            text not null,
  document_id     uuid references public.documents(id),   -- tagged SOP
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);
create index if not exists chat_messages_convo_idx on public.chat_messages (conversation_id, created_at);
alter table public.chat_messages enable row level security;
alter table public.chat_messages force row level security;
drop policy if exists chat_messages_own on public.chat_messages;
create policy chat_messages_own on public.chat_messages for select to authenticated
  using (exists (select 1 from public.conversations c
                 where c.id = conversation_id and (c.user_a = auth.uid() or c.user_b = auth.uid())));
grant select on public.chat_messages to authenticated;

create or replace function public.start_conversation(p_user uuid)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare v_caller uuid := auth.uid(); v_ctx record; v_a uuid; v_b uuid; v_id uuid; begin
  select * into v_ctx from app.actor_context(v_caller);
  if v_ctx.tenant_id is null then raise exception 'start_conversation: not an org user'; end if;
  if not app.module_enabled(v_ctx.tenant_id, 'messages') then
    raise exception 'start_conversation: the messages module is off'; end if;
  if p_user = v_caller then raise exception 'start_conversation: that is you'; end if;
  if not exists (select 1 from public.users where id = p_user and tenant_id = v_ctx.tenant_id and plane = 'org') then
    raise exception 'start_conversation: no such member'; end if;
  v_a := least(v_caller, p_user); v_b := greatest(v_caller, p_user);
  insert into public.conversations(tenant_id, user_a, user_b)
    values (v_ctx.tenant_id, v_a, v_b)
    on conflict (tenant_id, user_a, user_b) do nothing;
  select id into v_id from public.conversations
    where tenant_id = v_ctx.tenant_id and user_a = v_a and user_b = v_b;
  return v_id;
end; $$;

create or replace function public.send_chat_message(p_conversation uuid, p_body text, p_document uuid default null)
returns uuid language plpgsql security definer set search_path = app, public as $$
declare c public.conversations; v_caller uuid := auth.uid(); v_id uuid; begin
  select * into c from public.conversations where id = p_conversation;
  if c.id is null or (c.user_a <> v_caller and c.user_b <> v_caller) then
    raise exception 'send_chat_message: not your conversation'; end if;
  if not app.module_enabled(c.tenant_id, 'messages') then
    raise exception 'send_chat_message: the messages module is off'; end if;
  if length(trim(coalesce(p_body,''))) = 0 and p_document is null then
    raise exception 'send_chat_message: an empty message'; end if;
  if length(coalesce(p_body,'')) > 4000 then
    raise exception 'send_chat_message: message too long (4000 chars max)'; end if;
  if p_document is not null and not exists (
      select 1 from public.documents where id = p_document and tenant_id = c.tenant_id) then
    raise exception 'send_chat_message: no such document'; end if;
  insert into public.chat_messages(conversation_id, tenant_id, sender_id, body, document_id)
    values (p_conversation, c.tenant_id, v_caller, trim(coalesce(p_body,'')), p_document)
    returning id into v_id;
  return v_id;
end; $$;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void language sql security definer set search_path = app, public as $$
  update public.chat_messages m set read_at = now()
  from public.conversations c
  where m.conversation_id = p_conversation and c.id = p_conversation
    and (c.user_a = auth.uid() or c.user_b = auth.uid())
    and m.sender_id <> auth.uid() and m.read_at is null;
$$;

-- ---- The one poll: combined unread counts (module-gated) ----
create or replace function public.pulse_counts()
returns table (notifications int, broadcasts int, messages int)
language plpgsql stable security definer set search_path = app, public as $$
declare v_ctx record; v_me uuid := auth.uid();
begin
  select * into v_ctx from app.actor_context(v_me);
  notifications := 0; broadcasts := 0; messages := 0;
  if v_ctx.tenant_id is null then return next; return; end if;
  if app.module_enabled(v_ctx.tenant_id, 'pulse') then
    select count(*)::int into notifications from public.notifications
      where user_id = v_me and read_at is null;
  end if;
  if app.module_enabled(v_ctx.tenant_id, 'broadcasts') then
    select count(*)::int into broadcasts from public.broadcasts b
      where b.tenant_id = v_ctx.tenant_id
        and exists (select 1 from app.broadcast_audience(b.id) a where a = v_me)
        and not exists (select 1 from public.broadcast_acks k
                        where k.broadcast_id = b.id and k.user_id = v_me);
  end if;
  if app.module_enabled(v_ctx.tenant_id, 'messages') then
    select count(*)::int into messages from public.chat_messages m
      join public.conversations c on c.id = m.conversation_id
      where (c.user_a = v_me or c.user_b = v_me)
        and m.sender_id <> v_me and m.read_at is null;
  end if;
  return next;
end; $$;

-- ---- Sound preference (per user) ----
create table if not exists public.user_prefs (
  user_id       uuid primary key references public.users(id),
  sound_enabled boolean not null default true,
  updated_at    timestamptz not null default now()
);
alter table public.user_prefs enable row level security;
alter table public.user_prefs force row level security;
drop policy if exists user_prefs_own on public.user_prefs;
create policy user_prefs_own on public.user_prefs for select to authenticated
  using (user_id = auth.uid());
grant select on public.user_prefs to authenticated;

create or replace function public.set_sound_pref(p_on boolean)
returns void language sql security definer set search_path = app, public as $$
  insert into public.user_prefs(user_id, sound_enabled, updated_at)
  values (auth.uid(), coalesce(p_on, true), now())
  on conflict (user_id) do update set sound_enabled = excluded.sound_enabled, updated_at = now();
$$;

do $$ declare fn text; begin
  foreach fn in array array[
    'mark_notification_read(uuid)','mark_all_notifications_read()',
    'send_broadcast(text,text,uuid)','acknowledge_broadcast(uuid)',
    'start_conversation(uuid)','send_chat_message(uuid,text,uuid)',
    'mark_conversation_read(uuid)','pulse_counts()','set_sound_pref(boolean)']
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
