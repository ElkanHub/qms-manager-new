-- ============================================================================
-- Phase 1 — Audit substrate (built first, below everything)
-- Total, append-only, hash-chained audit trail. The single sanctioned write path
-- is app.write_audit(). Rules 0.1 (nothing escapes audit) and immutability live here.
-- Per-tenant hash chains so each tenant's integrity is independently verifiable.
-- ============================================================================

create table if not exists public.audit_trail (
  id             bigint generated always as identity primary key,
  occurred_at    timestamptz not null,                 -- server time (never client-supplied)
  actor_id       uuid,                                 -- authenticated actor (auth.users.id)
  actor_email    text,                                 -- denormalized: survives deactivation
  action         text not null,                        -- precisely named action/transition
  chain_key      text not null,                        -- hash-chain partition: tenant_id or 'platform'
  tenant_id      uuid,
  org_id         uuid,
  department_id  uuid,
  entity_type    text,
  entity_id      text,
  old_value      jsonb,
  new_value      jsonb,
  reason         text,                                 -- required for discretionary actions
  source         text,                                 -- screen/endpoint the action came from
  session_id     text,
  request_id     text,
  metadata       jsonb not null default '{}'::jsonb,
  prev_hash      bytea not null,                       -- previous entry's hash on this chain
  entry_hash     bytea not null                        -- sha256(prev_hash || canonical content)
);

comment on table public.audit_trail is
  'Append-only, hash-chained audit trail. Sole writer: app.write_audit(). No UPDATE/DELETE ever.';

-- Filter/sort indexes for the Phase 7 viewer, plus the chain-order index for verification.
create index if not exists audit_chain_order_idx on public.audit_trail (chain_key, id);
create index if not exists audit_tenant_idx      on public.audit_trail (tenant_id);
create index if not exists audit_actor_idx       on public.audit_trail (actor_id);
create index if not exists audit_action_idx      on public.audit_trail (action);
create index if not exists audit_occurred_idx    on public.audit_trail (occurred_at);
create index if not exists audit_entity_idx      on public.audit_trail (entity_type, entity_id);

-- Default-deny from the start. Viewing policies are added in Phase 7 (scoped by rule).
alter table public.audit_trail enable row level security;
alter table public.audit_trail force row level security;

-- ---------------------------------------------------------------------------
-- Canonical content serialization — used identically by writer and verifier so
-- the chain is reproducible. Any field change alters the hash → tamper-evident.
-- ---------------------------------------------------------------------------
create or replace function app.audit_content(
  p_occurred_at timestamptz, p_actor_id uuid, p_actor_email text, p_action text,
  p_tenant_id uuid, p_org_id uuid, p_department_id uuid,
  p_entity_type text, p_entity_id text, p_old jsonb, p_new jsonb,
  p_reason text, p_source text, p_session_id text, p_request_id text, p_metadata jsonb
) returns text
language sql immutable
as $$
  select concat_ws('|',
    p_occurred_at::text,
    coalesce(p_actor_id::text, ''), coalesce(p_actor_email, ''), p_action,
    coalesce(p_tenant_id::text, ''), coalesce(p_org_id::text, ''), coalesce(p_department_id::text, ''),
    coalesce(p_entity_type, ''), coalesce(p_entity_id, ''),
    coalesce(p_old::text, ''), coalesce(p_new::text, ''), coalesce(p_reason, ''),
    coalesce(p_source, ''), coalesce(p_session_id, ''), coalesce(p_request_id, ''),
    coalesce(p_metadata::text, '')
  );
$$;

-- ---------------------------------------------------------------------------
-- Immutability guards. Belt (privileges) AND suspenders (triggers). The trigger
-- catches even the table owner / service_role; UPDATE/DELETE/TRUNCATE always raise.
-- INSERT is allowed only when app.write_audit() has flagged the transaction.
-- ---------------------------------------------------------------------------
create or replace function app.audit_guard_rows() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    raise exception 'audit_trail is append-only: % is not permitted', tg_op;
  end if;
  -- INSERT: must be sanctioned by the write primitive.
  if current_setting('app.audit_write', true) is distinct from 'on' then
    raise exception 'audit_trail inserts must go through app.write_audit()';
  end if;
  return new;
end;
$$;

create or replace function app.audit_guard_truncate() returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_trail is append-only: TRUNCATE is not permitted';
end;
$$;

drop trigger if exists audit_guard_rows on public.audit_trail;
create trigger audit_guard_rows
  before insert or update or delete on public.audit_trail
  for each row execute function app.audit_guard_rows();

drop trigger if exists audit_guard_truncate on public.audit_trail;
create trigger audit_guard_truncate
  before truncate on public.audit_trail
  for each statement execute function app.audit_guard_truncate();

-- ---------------------------------------------------------------------------
-- The audit-write primitive — the ONLY sanctioned way to write audit.
-- SECURITY DEFINER so it can insert while direct writes are revoked/blocked.
-- ---------------------------------------------------------------------------
create or replace function app.write_audit(
  p_action        text,
  p_actor_id      uuid    default null,
  p_actor_email   text    default null,
  p_tenant_id     uuid    default null,
  p_org_id        uuid    default null,
  p_department_id uuid    default null,
  p_entity_type   text    default null,
  p_entity_id     text    default null,
  p_old           jsonb   default null,
  p_new           jsonb   default null,
  p_reason        text    default null,
  p_source        text    default null,
  p_session_id    text    default null,
  p_request_id    text    default null,
  p_metadata      jsonb   default '{}'::jsonb,
  p_require_reason boolean default false
) returns bigint
language plpgsql
security definer
set search_path = app, public, extensions
as $$
declare
  v_occurred timestamptz := clock_timestamp();   -- contemporaneous server time
  v_actor    uuid := coalesce(p_actor_id, auth.uid());
  v_chain    text := coalesce(p_tenant_id::text, 'platform');
  v_prev     bytea;
  v_content  text;
  v_hash     bytea;
  v_id       bigint;
begin
  if p_action is null or length(trim(p_action)) = 0 then
    raise exception 'audit: action is required';
  end if;
  if p_require_reason and (p_reason is null or length(trim(p_reason)) = 0) then
    raise exception 'audit: a reason is required for action %', p_action;
  end if;

  -- Serialize concurrent writers on this chain so prev_hash is consistent.
  perform pg_advisory_xact_lock(hashtextextended(v_chain, 0));

  select entry_hash into v_prev
  from public.audit_trail
  where chain_key = v_chain
  order by id desc
  limit 1;

  if v_prev is null then
    v_prev := digest('qms-audit-genesis:' || v_chain, 'sha256');   -- per-chain genesis
  end if;

  v_content := app.audit_content(v_occurred, v_actor, p_actor_email, p_action,
    p_tenant_id, p_org_id, p_department_id, p_entity_type, p_entity_id,
    p_old, p_new, p_reason, p_source, p_session_id, p_request_id, coalesce(p_metadata, '{}'::jsonb));

  v_hash := digest(v_prev || convert_to(v_content, 'UTF8'), 'sha256');

  perform set_config('app.audit_write', 'on', true);   -- sanction this one insert
  insert into public.audit_trail(
    occurred_at, actor_id, actor_email, action, chain_key,
    tenant_id, org_id, department_id, entity_type, entity_id,
    old_value, new_value, reason, source, session_id, request_id, metadata,
    prev_hash, entry_hash)
  values (v_occurred, v_actor, p_actor_email, p_action, v_chain,
    p_tenant_id, p_org_id, p_department_id, p_entity_type, p_entity_id,
    p_old, p_new, p_reason, p_source, p_session_id, p_request_id, coalesce(p_metadata, '{}'::jsonb),
    v_prev, v_hash)
  returning id into v_id;
  perform set_config('app.audit_write', 'off', true);  -- close the window immediately

  return v_id;
end;
$$;

comment on function app.write_audit is
  'The single sanctioned audit writer. Every controlled action calls this (rule 0.1).';

-- ---------------------------------------------------------------------------
-- Chain verification — walks each chain, recomputes hashes, reports any break.
-- ---------------------------------------------------------------------------
create or replace function app.verify_audit_chain(p_chain text default null)
returns table(chain text, ok boolean, broken_at bigint, entries bigint)
language plpgsql
security definer
set search_path = app, public, extensions
as $$
declare
  v_chain   text;
  v_prev    bytea;
  v_content text;
  v_calc    bytea;
  v_break   bigint;
  v_count   bigint;
  r         record;
begin
  for v_chain in
    select distinct at.chain_key from public.audit_trail at
    where p_chain is null or at.chain_key = p_chain
  loop
    v_prev  := digest('qms-audit-genesis:' || v_chain, 'sha256');
    v_break := null;
    v_count := 0;
    for r in
      select * from public.audit_trail at where at.chain_key = v_chain order by at.id
    loop
      v_count := v_count + 1;
      v_content := app.audit_content(r.occurred_at, r.actor_id, r.actor_email, r.action,
        r.tenant_id, r.org_id, r.department_id, r.entity_type, r.entity_id,
        r.old_value, r.new_value, r.reason, r.source, r.session_id, r.request_id, r.metadata);
      v_calc := digest(v_prev || convert_to(v_content, 'UTF8'), 'sha256');
      if r.prev_hash is distinct from v_prev or r.entry_hash is distinct from v_calc then
        v_break := r.id;
        exit;
      end if;
      v_prev := r.entry_hash;
    end loop;
    chain := v_chain; ok := (v_break is null); broken_at := v_break; entries := v_count;
    return next;
  end loop;
end;
$$;

comment on function app.verify_audit_chain is
  'Walks the hash chain(s) and reports the first break, if any. Read-only.';

-- ---------------------------------------------------------------------------
-- Privileges: direct table writes are revoked for everyone; only the definer
-- primitive writes. SELECT is granted but RLS is default-deny until Phase 7.
-- ---------------------------------------------------------------------------
revoke all on public.audit_trail from public, anon, authenticated, service_role;
grant select on public.audit_trail to authenticated, service_role;

grant execute on function app.write_audit(
  text, uuid, text, uuid, uuid, uuid, text, text, jsonb, jsonb, text, text, text, text, jsonb, boolean
) to authenticated, service_role;
grant execute on function app.verify_audit_chain(text) to service_role;
