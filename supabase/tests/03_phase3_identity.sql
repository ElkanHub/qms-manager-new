-- Phase 3 acceptance: invite-only birth, bound accounts, no self-signup, deactivation.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A', 'Org A', gen_random_uuid());

-- Stand up two auth identities (Google would create these; we simulate).
insert into auth.users (id, aud, role, email, raw_app_meta_data, created_at, updated_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
        'qa@a.test', '{}'::jsonb, now(), now()),
       ('aaaaaaaa-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
        'late@a.test', '{}'::jsonb, now(), now());

-- Create + accept an invitation → account born bound to the invite context.
do $$
declare v_token text;
begin
  select token into v_token from app.create_invitation(
    'qa@a.test', 'org', 'QA',
    (select tenant_id from t), (select org_id from t), (select qa_department_id from t));
  perform public.accept_invitation(v_token, 'aaaaaaaa-0000-0000-0000-000000000001', 'qa@a.test', 'QA User');
end $$;

select assert(
  (select tenant_id from users where id = 'aaaaaaaa-0000-0000-0000-000000000001')
    = (select tenant_id from t)
  and (select department_id from users where id = 'aaaaaaaa-0000-0000-0000-000000000001')
    = (select qa_department_id from t)
  and (select initial_role from users where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'QA',
  'account is born bound to the invite tenant/department/role');

-- JWT app_metadata was stamped with tenant_id (so RLS/tenant context resolve).
select assert(
  (select raw_app_meta_data ->> 'tenant_id' from auth.users
     where id = 'aaaaaaaa-0000-0000-0000-000000000001') = (select tenant_id::text from t),
  'auth metadata stamped with tenant_id on acceptance');

-- Reused invitation cannot create another account.
select assert_raises(
  $$select public.accept_invitation(
      (select token from invitations where email='qa@a.test'),
      'aaaaaaaa-0000-0000-0000-000000000002', 'qa@a.test')$$,
  'an already-accepted invitation must be rejected');

-- Expired invitation is rejected.
do $$
declare v_token text;
begin
  select token into v_token from app.create_invitation(
    'late@a.test', 'org', 'Author',
    (select tenant_id from t), (select org_id from t), (select qa_department_id from t),
    '{}'::jsonb, null, null, interval '-1 second');
  begin
    perform public.accept_invitation(v_token, 'aaaaaaaa-0000-0000-0000-000000000002', 'late@a.test');
    raise exception 'expected expiry rejection';
  exception when others then
    if sqlerrm not like '%expired%' then raise; end if;
  end;
end $$;

-- Email mismatch is rejected.
do $$
declare v_token text;
begin
  select token into v_token from app.create_invitation(
    'someoneelse@a.test', 'org', 'Author',
    (select tenant_id from t), (select org_id from t), (select qa_department_id from t));
  begin
    perform public.accept_invitation(v_token, 'aaaaaaaa-0000-0000-0000-000000000002', 'late@a.test');
    raise exception 'expected email-mismatch rejection';
  exception when others then
    if sqlerrm not like '%does not match%' then raise; end if;
  end;
end $$;

-- No self-signup: an authenticated user cannot insert a users row directly.
select set_config('request.jwt.claims',
  json_build_object('app_metadata', json_build_object('tenant_id', (select tenant_id from t)))::text, true);
set local role authenticated;
select assert_raises(
  $$insert into users(id, tenant_id, email) values (gen_random_uuid(),
      (select tenant_id from t), 'sneak@a.test')$$,
  'authenticated cannot self-create an account');
reset role;
select set_config('request.jwt.claims', null, true);

-- Deactivation: preserves the row (attribution), bans auth, requires a reason.
select app.deactivate_user('aaaaaaaa-0000-0000-0000-000000000001',
  gen_random_uuid(), 'admin@a.test', 'left the company');
select assert(
  (select status from users where id='aaaaaaaa-0000-0000-0000-000000000001') = 'deactivated'
  and (select banned_until from auth.users where id='aaaaaaaa-0000-0000-0000-000000000001') is not null,
  'deactivated user is banned but still present (attribution preserved)');
select assert(
  exists(select 1 from audit_trail where action='user.deactivated'
         and entity_id='aaaaaaaa-0000-0000-0000-000000000001'),
  'deactivation is audited');
select assert_raises(
  $$select app.deactivate_user('aaaaaaaa-0000-0000-0000-000000000002', gen_random_uuid(), 'a@a.test', null)$$,
  'deactivation without a reason must be rejected');
