-- Onboarding acceptance: platform configures the flow; the user completes it with
-- required-field validation; everything is audited.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A', 'Org A', gen_random_uuid());

insert into auth.users (id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('ffffffff-0000-0000-0000-000000000002','authenticated','authenticated','admin@p.test','{}',now(),now()),
  ('ffffffff-0000-0000-0000-000000000003','authenticated','authenticated','user@a.test','{}',now(),now());
insert into public.users(id, email, plane, initial_role) values
  ('ffffffff-0000-0000-0000-000000000002','admin@p.test','platform','admin');
insert into public.platform_scopes(user_id, scope) values
  ('ffffffff-0000-0000-0000-000000000002','switchboard');
do $$
declare tok text;
begin
  select token into tok from app.create_invitation('user@a.test','org','author',
    (select tenant_id from t),(select org_id from t),(select qa_department_id from t));
  perform public.accept_invitation(tok, 'ffffffff-0000-0000-0000-000000000003', 'user@a.test');
end $$;

-- ---- platform (switchboard scope) sets the flow ----
select set_config('request.jwt.claims', json_build_object('sub','ffffffff-0000-0000-0000-000000000002',
  'app_metadata', json_build_object('platform_role','admin'))::text, true);
set local role authenticated;
select public.set_onboarding_flow((select tenant_id from t), $json$
  [ {"key":"profile","title":"Your profile",
     "fields":[ {"key":"phone","label":"Phone","type":"text","required":true},
                {"key":"note","label":"Note","type":"textarea","required":false} ]} ]
$json$::jsonb);
reset role;

select assert((select jsonb_array_length(steps) from onboarding_flows
               where tenant_id=(select tenant_id from t)) = 1, 'flow saved with one step');
select assert(exists(select 1 from audit_trail where action='onboarding.flow_set'),
  'setting the flow is audited');

-- non-switchboard caller cannot configure
select set_config('request.jwt.claims', json_build_object('sub','ffffffff-0000-0000-0000-000000000003',
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
set local role authenticated;
select assert_raises($$select public.set_onboarding_flow((select tenant_id from t),'[]'::jsonb)$$,
  'an org user cannot configure the onboarding flow');

-- ---- the user completes onboarding (required field enforced) ----
select assert_raises($$select public.submit_onboarding('{"note":"hi"}'::jsonb)$$,
  'submitting without the required field is refused');
select public.submit_onboarding('{"phone":"0800","note":"hi"}'::jsonb);
reset role;

select assert((select onboarded_at from users where id='ffffffff-0000-0000-0000-000000000003') is not null,
  'user is marked onboarded after completing');
select assert((select answers->>'phone' from onboarding_responses
               where user_id='ffffffff-0000-0000-0000-000000000003') = '0800',
  'collected data is stored');
select assert(exists(select 1 from audit_trail where action='onboarding.completed'),
  'completing onboarding is audited');
select set_config('request.jwt.claims', null, true);
