-- Signing v2 acceptance: no stored signature → no signing; the signer's choice
-- (drawn vs initials) lands on the signature record and the chain.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('abab0000-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now()),
  ('abab0000-0000-0000-0000-000000000002','authenticated','authenticated','req@a.test','{}',now(),now());
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('abab0000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa'),
  ('abab0000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'req@a.test','org','author');
insert into public.user_roles(user_id, tenant_id, role) values
  ('abab0000-0000-0000-0000-000000000001',(select tenant_id from t),'qa');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;

-- a change control parked at signatures_pending with one qa slot
create temp table cc (id uuid) on commit drop;
do $$ declare v uuid; begin
  insert into change_controls(id, tenant_id, org_id, department_id, type, status, classification, requester_id)
    values (gen_random_uuid(),(select tenant_id from t),(select org_id from t),(select qa_department_id from t),
            'CHANGE_SINGLE','signatures_pending','minor','abab0000-0000-0000-0000-000000000002')
    returning id into v;
  insert into cc values (v);
  insert into public.signatures(change_control_id, tenant_id, role_key)
    values (v,(select tenant_id from t),'qa');
end $$;

-- ============ No stored signature → signing refused ============
select pg_temp.as_user('abab0000-0000-0000-0000-000000000001');
select assert_raises($$select public.apply_signature((select id from cc), 'approved')$$,
  'signing requires a captured signature on file');

-- capture → invalid kind refused → initials signing lands with its kind
select public.save_user_signature('data:image/png;base64,' || repeat('iVBORw0KGgoAAAANSUhEUg', 20), 'drawn');
select assert_raises($$select public.apply_signature((select id from cc), 'approved', 'stamp')$$,
  'signature kind vocabulary enforced');
select public.apply_signature((select id from cc), 'approved', 'initials');
select assert((select signature_kind from signatures where change_control_id=(select id from cc)) = 'initials',
  'the record shows WHICH signature was applied');
select assert(exists(select 1 from audit_trail where action='signature.applied'
    and new_value->>'kind'='initials' and actor_email='qa@a.test'),
  'the kind is on the chain with the signer');

select set_config('request.jwt.claims', null, true);
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact');
