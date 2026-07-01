-- Phase 1 acceptance criteria, executable.
-- Runs inside a rolled-back tx (harness). Uses a fixed fake tenant chain.

-- (1) The primitive writes; entries chain correctly.
select app.write_audit('test.action.one', '11111111-1111-1111-1111-111111111111'::uuid,
  'a@x.test', '22222222-2222-2222-2222-222222222222'::uuid, null, null,
  'thing', 'e1', null, '{"v":1}'::jsonb, null, 'test', null, null, '{}'::jsonb);
select app.write_audit('test.action.two', '11111111-1111-1111-1111-111111111111'::uuid,
  'a@x.test', '22222222-2222-2222-2222-222222222222'::uuid, null, null,
  'thing', 'e1', '{"v":1}'::jsonb, '{"v":2}'::jsonb, null, 'test', null, null, '{}'::jsonb);

select assert(
  (select count(*) from audit_trail where chain_key = '22222222-2222-2222-2222-222222222222') = 2,
  'two audit entries written to the tenant chain'
);

-- chain link: entry 2's prev_hash equals entry 1's entry_hash
select assert(
  (select a2.prev_hash from audit_trail a1
     join audit_trail a2 on a2.id > a1.id
    where a1.chain_key = '22222222-2222-2222-2222-222222222222'
    order by a1.id, a2.id limit 1)
  = (select entry_hash from audit_trail
       where chain_key = '22222222-2222-2222-2222-222222222222' order by id limit 1),
  'entry 2 prev_hash links to entry 1 entry_hash'
);

-- old/new values recorded
select assert(
  (select new_value->>'v' from audit_trail where action = 'test.action.two') = '2'
  and (select old_value->>'v' from audit_trail where action = 'test.action.two') = '1',
  'old/new values captured correctly'
);

-- (2) verification passes on an untampered chain
select assert(
  (select ok from app.verify_audit_chain('22222222-2222-2222-2222-222222222222')),
  'untampered chain verifies ok'
);

-- (3) UPDATE / DELETE / direct INSERT / TRUNCATE all rejected at the DB level
select assert_raises(
  $$update audit_trail set action = 'x' where chain_key = '22222222-2222-2222-2222-222222222222'$$,
  'UPDATE on audit_trail must be rejected');
select assert_raises(
  $$delete from audit_trail where chain_key = '22222222-2222-2222-2222-222222222222'$$,
  'DELETE on audit_trail must be rejected');
select assert_raises(
  $$insert into audit_trail(occurred_at, action, chain_key, prev_hash, entry_hash)
    values (now(), 'sneak', 'x', '\x00', '\x00')$$,
  'direct INSERT (bypassing app.write_audit) must be rejected');

-- (3b) ...and for EVERY role, not just the privileged connection: anon,
-- authenticated and service_role all fail to alter or remove audit rows
-- (privileges revoked; guard trigger and RLS back-stop). Whatever the failure
-- mode, the rows must come through untouched.
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    execute format('set local role %I', r);
    -- Attempt the mutation; the failure mode (permission denied, guard trigger,
    -- or RLS zero-row no-op) is irrelevant — the rows must survive untouched.
    begin execute 'update audit_trail set action = ''SNEAK'''; exception when others then null; end;
    begin execute 'delete from audit_trail';                   exception when others then null; end;
    execute 'reset role';
  end loop;
end $$;
select assert(not exists(select 1 from audit_trail where action='SNEAK'),
  'no role rewrote any audit row');
select assert(
  (select count(*) from audit_trail where chain_key='22222222-2222-2222-2222-222222222222') = 2,
  'no role removed any audit row');

-- (4) action is required
select assert_raises(
  $$select app.write_audit(null)$$,
  'audit write without an action must be rejected');

-- (5) require_reason enforced when asked
select assert_raises(
  $$select app.write_audit('discretionary.act', null, null, null, null, null, null, null,
      null, null, null, null, null, null, '{}'::jsonb, true)$$,
  'discretionary action without a reason must be rejected');

-- (6) tamper detection: simulate out-of-band mutation, prove verify catches it.
alter table public.audit_trail disable trigger audit_guard_rows;
update public.audit_trail set action = 'TAMPERED'
  where id = (select min(id) from audit_trail
              where chain_key = '22222222-2222-2222-2222-222222222222');
alter table public.audit_trail enable trigger audit_guard_rows;

select assert(
  not (select ok from app.verify_audit_chain('22222222-2222-2222-2222-222222222222')),
  'tampered chain must fail verification'
);
select assert(
  (select broken_at from app.verify_audit_chain('22222222-2222-2222-2222-222222222222'))
  = (select min(id) from audit_trail where chain_key = '22222222-2222-2222-2222-222222222222'),
  'verification pinpoints the tampered entry'
);
