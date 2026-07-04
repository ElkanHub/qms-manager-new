-- Pulse + Broadcasts + Messages acceptance: the event seams feed the pulse
-- (module-gated, no-op when off); broadcast authority + acknowledgement with
-- sender counts (send/ack audited); 1:1 chat with SOP tags and unread counts;
-- pulse_counts combines all three; the core flow never depends on any of it.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('acac0000-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now()),
  ('acac0000-0000-0000-0000-000000000002','authenticated','authenticated','hod@a.test','{}',now(),now()),
  ('acac0000-0000-0000-0000-000000000003','authenticated','authenticated','emp@a.test','{}',now(),now()),
  ('acac0000-0000-0000-0000-000000000004','authenticated','authenticated','prod@a.test','{}',now(),now());
insert into public.departments(id, tenant_id, org_id, name, code)
  values ('0d000000-0000-0000-0000-0000000000bb',(select tenant_id from t),(select org_id from t),'Production','PROD');
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('acac0000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa'),
  ('acac0000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'hod@a.test','org','hod'),
  ('acac0000-0000-0000-0000-000000000003',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'emp@a.test','org','author'),
  ('acac0000-0000-0000-0000-000000000004',(select tenant_id from t),(select org_id from t),'0d000000-0000-0000-0000-0000000000bb','prod@a.test','org','author');
insert into public.user_roles(user_id, tenant_id, role, department_id) values
  ('acac0000-0000-0000-0000-000000000001',(select tenant_id from t),'qa',null),
  ('acac0000-0000-0000-0000-000000000002',(select tenant_id from t),'hod',(select qa_department_id from t));

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;

-- ============ Module OFF → the pulse seam is a silent no-op ============
do $$ declare doc uuid; ver uuid; begin
  perform pg_temp.as_user('acac0000-0000-0000-0000-000000000003');
  select document_id, version_id into doc, ver from app.create_document((select tenant_id from t),
    (select org_id from t),(select qa_department_id from t),'Quiet Doc', null,
    'acac0000-0000-0000-0000-000000000003','acac0000-0000-0000-0000-000000000003');
  perform public.submit_document(doc);
  perform assert((select count(*) from notifications) = 0,
    'pulse off → the submit produced no notifications, and the flow completed');
end $$;

insert into public.tenant_modules(tenant_id, module_key, enabled) values
  ((select tenant_id from t),'pulse', true),
  ((select tenant_id from t),'broadcasts', true),
  ((select tenant_id from t),'messages', true);

-- ============ The seams feed the pulse ============
do $$ declare doc uuid; ver uuid; req uuid; begin
  perform pg_temp.as_user('acac0000-0000-0000-0000-000000000003');
  select document_id, version_id into doc, ver from app.create_document((select tenant_id from t),
    (select org_id from t),(select qa_department_id from t),'Pinged Doc', null,
    'acac0000-0000-0000-0000-000000000003','acac0000-0000-0000-0000-000000000003');
  req := public.submit_document(doc);
  perform assert(exists(select 1 from notifications
      where user_id='acac0000-0000-0000-0000-000000000002' and kind='endorsement'),
    'submission pings the department HOD for endorsement');
  -- changes requested → the author is pinged
  perform pg_temp.as_user('acac0000-0000-0000-0000-000000000002');
  perform public.request_changes(req, 'tighten section 4');
  perform assert(exists(select 1 from notifications
      where user_id='acac0000-0000-0000-0000-000000000003' and kind='changes_requested'),
    'changes-requested pings the author');
end $$;

-- effective revision → the department is pinged
do $$ declare doc uuid; ver uuid; begin
  select document_id, version_id into doc, ver from app.create_document((select tenant_id from t),
    (select org_id from t),(select qa_department_id from t),'Effective Doc', null, gen_random_uuid(), gen_random_uuid());
  perform app.transition_version(ver,'in_approval', gen_random_uuid());
  perform app.transition_version(ver,'approved', gen_random_uuid());
  perform app.make_effective(ver, gen_random_uuid());
  perform assert(exists(select 1 from notifications
      where user_id='acac0000-0000-0000-0000-000000000003' and kind='effective'),
    'a new effective revision pings the department');
end $$;

-- mark read: own only, and mark-all clears the badge
select pg_temp.as_user('acac0000-0000-0000-0000-000000000003');
select public.mark_all_notifications_read();
select assert((select notifications from public.pulse_counts()) = 0, 'mark-all clears the pulse count');
select assert((select count(*) from notifications where user_id='acac0000-0000-0000-0000-000000000002'
    and read_at is not null) = 0, 'marking mine read never touches anyone else''s');

-- ============ Broadcasts: authority, audience, ack, counts ============
select pg_temp.as_user('acac0000-0000-0000-0000-000000000003');
select assert_raises($$select public.send_broadcast('Hi','all hands', null)$$,
  'a regular member cannot broadcast');
select pg_temp.as_user('acac0000-0000-0000-0000-000000000002');
select assert_raises(
  $$select public.send_broadcast('Wrong dept','x','0d000000-0000-0000-0000-0000000000bb')$$,
  'an HOD cannot broadcast to another department');
select assert_raises($$select public.send_broadcast('All','x', null)$$,
  'an HOD cannot broadcast company-wide');

create temp table bc on commit drop as
  select public.send_broadcast('Gowning update','New gowning SOP takes effect Monday.',
    (select qa_department_id from t)) as dept_id;
select pg_temp.as_user('acac0000-0000-0000-0000-000000000001');
create temp table bc2 on commit drop as
  select public.send_broadcast('Site notice','Annual audit next month.', null) as all_id;

-- audience: dept broadcast excludes other departments and the sender
select assert((select count(*) from app.broadcast_audience((select dept_id from bc))) = 2,
  'department broadcast concerns the department (sender excluded)');
select assert((select count(*) from app.broadcast_audience((select all_id from bc2))) = 3,
  'company broadcast concerns everyone else in the org');

-- receiver acks; double-ack is idempotent; outsider refused
select pg_temp.as_user('acac0000-0000-0000-0000-000000000003');
select assert((select broadcasts from public.pulse_counts()) = 2, 'both broadcasts count as unacked');
select public.acknowledge_broadcast((select dept_id from bc));
select public.acknowledge_broadcast((select dept_id from bc));
select assert((select broadcasts from public.pulse_counts()) = 1, 'acknowledging clears it from the count');
select pg_temp.as_user('acac0000-0000-0000-0000-000000000004');
select assert_raises($$select public.acknowledge_broadcast((select dept_id from bc))$$,
  'a department broadcast cannot be acknowledged by an outsider');

-- the sender's tally
select assert((select count(*) from broadcast_acks where broadcast_id=(select dept_id from bc)) = 1,
  'the sender sees 1 of 2 acknowledged');
select assert(exists(select 1 from audit_trail where action='broadcast.sent')
          and exists(select 1 from audit_trail where action='broadcast.acknowledged'),
  'send and acknowledge are both on the chain');

-- ============ Messages: 1:1, SOP tags, unread, module gate ============
select pg_temp.as_user('acac0000-0000-0000-0000-000000000003');
create temp table convo on commit drop as
  select public.start_conversation('acac0000-0000-0000-0000-000000000004') as id;
select assert((select public.start_conversation('acac0000-0000-0000-0000-000000000004')) = (select id from convo),
  'starting the same conversation twice returns the same thread');
select assert_raises($$select public.start_conversation('acac0000-0000-0000-0000-000000000003')$$,
  'you cannot chat with yourself');

do $$ declare doc uuid; begin
  select id into doc from documents limit 1;
  perform public.send_chat_message((select id from convo), 'Check section 4 of this one', doc);
end $$;
select assert_raises($$select public.send_chat_message((select id from convo), '')$$,
  'empty messages are refused');

-- the counterpart sees 1 unread; an outsider sees nothing
select pg_temp.as_user('acac0000-0000-0000-0000-000000000004');
select assert((select messages from public.pulse_counts()) = 1, 'the recipient has 1 unread message');
select public.mark_conversation_read((select id from convo));
select assert((select messages from public.pulse_counts()) = 0, 'opening the thread clears the unread');
select pg_temp.as_user('acac0000-0000-0000-0000-000000000002');
set local role authenticated;
select assert((select count(*) from chat_messages) = 0, 'RLS: outsiders cannot read the conversation');
reset role;
select pg_temp.as_user('acac0000-0000-0000-0000-000000000002');
select assert_raises(
  $$select public.send_chat_message((select id from convo), 'let me in')$$,
  'outsiders cannot write into the conversation either');

-- module off → sending refused, counts go quiet, nothing else breaks
update public.tenant_modules set enabled=false
  where tenant_id=(select tenant_id from t) and module_key='messages';
select pg_temp.as_user('acac0000-0000-0000-0000-000000000003');
select assert_raises($$select public.send_chat_message((select id from convo), 'hello?')$$,
  'messages off → sending refused');
select assert((select messages from public.pulse_counts()) = 0, 'messages off → the count contributes zero');

select set_config('request.jwt.claims', null, true);
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact after the collaboration round');
