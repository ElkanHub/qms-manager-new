-- Onboarding v2 acceptance: server-decided audiences (first completer = org
-- setup, everyone after = member), locked defaults that no builder can touch,
-- signature required for completion (canvas/upload/phone-token paths), profile
-- stamping, and the chain.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('ffff0000-0000-0000-0000-000000000001','authenticated','authenticated','founder@a.test','{}',now(),now()),
  ('ffff0000-0000-0000-0000-000000000002','authenticated','authenticated','member@a.test','{}',now(),now()),
  ('ffff0000-0000-0000-0000-000000000003','authenticated','authenticated','plat@x.test','{}',now(),now());
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('ffff0000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'founder@a.test','org','org_admin'),
  ('ffff0000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'member@a.test','org','author');
insert into public.users(id, email, plane, initial_role) values
  ('ffff0000-0000-0000-0000-000000000003','plat@x.test','platform','owner');
insert into public.platform_members(user_id, is_owner) values ('ffff0000-0000-0000-0000-000000000003', true);

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;
create temp table sig on commit drop as
  select 'data:image/png;base64,' || repeat('iVBORw0KGgoAAAANSUhEUg', 20) as img;

-- ============ Audience: the founder gets org setup; defaults are merged ============
select pg_temp.as_user('ffff0000-0000-0000-0000-000000000001');
select assert((select audience from public.my_onboarding()) = 'org_setup',
  'the first member of the tenant runs the ORG SETUP flow');
select assert((select steps->0->'fields'->0->>'key' from public.my_onboarding()) = 'full_name',
  'the profile default leads the flow');
select assert((select count(*) from public.my_onboarding() o,
               jsonb_array_elements(o.steps) s where (s->>'locked')::boolean) >= 3,
  'org setup carries the locked defaults (profile, organization, signature)');

-- ============ Locked defaults cannot be redefined; reserved keys refused ============
select pg_temp.as_user('ffff0000-0000-0000-0000-000000000003');
select assert_raises(
  $$select public.set_onboarding_flow((select tenant_id from t),
      '[{"key":"signature","title":"fake","fields":[]}]'::jsonb, 'member')$$,
  'a locked default step key cannot be redefined');
select assert_raises(
  $$select public.set_onboarding_flow((select tenant_id from t),
      '[{"key":"extra","title":"Extra","fields":[{"key":"full_name","label":"x","type":"text"}]}]'::jsonb, 'member')$$,
  'reserved field keys are refused');
select assert_raises(
  $$select public.set_onboarding_flow((select tenant_id from t),
      '[{"key":"extra","title":"Extra","fields":[{"key":"pet","label":"x","type":"hologram"}]}]'::jsonb, 'member')$$,
  'unknown field types are refused');
-- a real custom step lands and appends AFTER the defaults
select public.set_onboarding_flow((select tenant_id from t),
  '[{"key":"extra","title":"Site details","fields":[{"key":"site","label":"Site","type":"text","required":true}]}]'::jsonb,
  'member');

-- ============ No signature, no completion ============
select pg_temp.as_user('ffff0000-0000-0000-0000-000000000001');
select assert_raises(
  $$select public.submit_onboarding('{"full_name":"Founder One","job_title":"QA Lead","branding_display_name":"Acme Pharma"}'::jsonb)$$,
  'completion is refused until the signature is captured');

-- capture (drawn) → completion works, profile stamps, audience recorded
select public.save_user_signature((select img from sig), 'drawn');
select public.submit_onboarding('{"full_name":"Founder One","job_title":"QA Lead","branding_display_name":"Acme Pharma"}'::jsonb);
select assert((select full_name from users where id='ffff0000-0000-0000-0000-000000000001') = 'Founder One',
  'the profile answer stamps the directory');
select assert((select audience from onboarding_responses where user_id='ffff0000-0000-0000-0000-000000000001') = 'org_setup',
  'the founder is recorded as the org-setup completer');

-- ============ Everyone after is a member; custom required field enforced ============
select pg_temp.as_user('ffff0000-0000-0000-0000-000000000002');
select assert((select audience from public.my_onboarding()) = 'member',
  'the second person runs the MEMBER flow');
select assert((select steps->-1->>'key' from public.my_onboarding()) = 'extra',
  'custom steps append after the locked defaults');
select public.save_user_signature((select img from sig), 'uploaded');
select assert_raises(
  $$select public.submit_onboarding('{"full_name":"Member Two","job_title":"Operator"}'::jsonb)$$,
  'custom required fields are enforced too');
select public.submit_onboarding('{"full_name":"Member Two","job_title":"Operator","site":"Kumasi"}'::jsonb);

-- ============ Signature guards ============
select assert_raises($$select public.save_user_signature('data:text/html;base64,PGI+', 'drawn')$$,
  'only PNG/JPEG data URLs are accepted');
select assert_raises($$select public.save_user_signature((select img from sig), 'telepathy')$$,
  'signature source vocabulary enforced');

-- ============ The phone path: single-use, expiring token ============
do $$ declare tok uuid; begin
  perform pg_temp.as_user('ffff0000-0000-0000-0000-000000000002');
  tok := public.create_signature_token();
  -- the phone page's server action runs as service_role — no user session
  perform set_config('request.jwt.claims', null, true);
  perform public.save_signature_by_token(tok, (select img from sig));
  perform assert((select source from user_signatures where user_id='ffff0000-0000-0000-0000-000000000002') = 'phone',
    'the phone capture replaces the active signature');
  begin
    perform public.save_signature_by_token(tok, (select img from sig));
    raise exception 'expected single-use';
  exception when others then if sqlerrm not like '%already used%' then raise; end if; end;
  -- an expired token refuses
  perform pg_temp.as_user('ffff0000-0000-0000-0000-000000000002');
  tok := public.create_signature_token();
  update public.signature_tokens set expires_at = now() - interval '1 minute' where token = tok;
  perform set_config('request.jwt.claims', null, true);
  begin
    perform public.save_signature_by_token(tok, (select img from sig));
    raise exception 'expected expiry';
  exception when others then if sqlerrm not like '%expired%' then raise; end if; end;
end $$;

-- the phone capture is audited AS the token's owner, never blank
select assert(exists(select 1 from audit_trail where action='signature.captured'
    and actor_email='member@a.test' and new_value->>'source'='phone'),
  'phone captures land on the chain attributed to the signer');

-- ============ Specimen data: every onboarded user has a readable signature ============
select pg_temp.as_user('ffff0000-0000-0000-0000-000000000001');
select assert((select count(*) from user_signatures) = 2,
  'the specimen has a signature for everyone who onboarded');

select set_config('request.jwt.claims', null, true);
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact after the onboarding round');
