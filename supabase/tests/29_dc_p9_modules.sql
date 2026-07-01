-- DC Phase 9 acceptance: training gate real when on; reconciliation blocks until
-- copies accounted when the register is on (safe defaults when off covered in P6/P7).

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('55550000-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now()),
  ('55550000-0000-0000-0000-000000000002','authenticated','authenticated','u@a.test','{}',now(),now());
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('55550000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa'),
  ('55550000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'u@a.test','org','author');
insert into public.user_roles(user_id, tenant_id, role) values ('55550000-0000-0000-0000-000000000001',(select tenant_id from t),'qa');
select set_config('request.jwt.claims', json_build_object('sub','55550000-0000-0000-0000-000000000001',
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);

-- ============ TRAINING GATE (module ON) ============
insert into public.tenant_modules(tenant_id, module_key, enabled, config)
  values ((select tenant_id from t),'training', true, '{"threshold":100}'::jsonb);
do $$ declare doc uuid; ver uuid;
begin
  select document_id, version_id into doc, ver from app.create_document((select tenant_id from t),
    (select org_id from t),(select qa_department_id from t),'Trained Doc', null, gen_random_uuid(), gen_random_uuid());
  perform app.transition_version(ver,'in_approval', gen_random_uuid());
  perform app.transition_version(ver,'approved', gen_random_uuid());
  update documents set status='pending_training' where id=doc;
  perform public.assign_training(doc,'55550000-0000-0000-0000-000000000002');  -- one assignee, not yet complete

  -- release blocked: threshold (100%) not met
  begin perform public.release_training(doc); raise exception 'expected training gate';
  exception when others then if sqlerrm not like '%threshold not met%' then raise; end if; end;

  -- complete training → release succeeds
  perform public.complete_training((select id from training_assignments where document_id=doc));
  perform public.release_training(doc);
  perform assert((select status from documents where id=doc)='active', 'release succeeds once the threshold is met');
end $$;

-- ============ RECONCILIATION (register module ON) ============
insert into public.tenant_modules(tenant_id, module_key, enabled) values ((select tenant_id from t),'controlled_copies', true);
do $$ declare doc uuid; v0 uuid; v1 uuid; cc uuid; copyid uuid;
begin
  -- effective v0
  select document_id, version_id into doc, v0 from app.create_document((select tenant_id from t),
    (select org_id from t),(select qa_department_id from t),'Copy Doc', null, gen_random_uuid(), gen_random_uuid());
  perform app.transition_version(v0,'in_approval', gen_random_uuid());
  perform app.transition_version(v0,'approved', gen_random_uuid());
  perform app.make_effective(v0, gen_random_uuid());
  -- prepared successor v1 (approved)
  v1 := app.add_revision(doc, gen_random_uuid());
  perform app.transition_version(v1,'in_approval', gen_random_uuid());
  perform app.transition_version(v1,'approved', gen_random_uuid());
  -- a change control parked at reconciliation, targeting the successor
  insert into change_controls(id, tenant_id, org_id, department_id, type, status, classification, requester_id)
    values (gen_random_uuid(),(select tenant_id from t),(select org_id from t),(select qa_department_id from t),
            'CHANGE_SINGLE','pending_reconciliation','minor','55550000-0000-0000-0000-000000000002')
    returning id into cc;
  insert into change_control_documents(change_control_id, document_id, target_version_id, needs_training)
    values (cc, doc, v1, false);
  -- issue a controlled copy of the OUTGOING (effective v0)
  copyid := public.issue_controlled_copy(v0, 'shop floor');

  -- reconciliation blocks while a copy is outstanding
  begin perform public.reconcile_cc(cc, null); raise exception 'expected outstanding block';
  exception when others then if sqlerrm not like '%outstanding%' then raise; end if; end;

  -- account for the copy → reconciliation passes → change effective
  perform public.reconcile_copy(copyid, 'returned');
  perform assert(public.reconcile_cc(cc, null) = 'effective', 'reconciliation passes once every copy is accounted');
  perform assert((select status from change_controls where id=cc)='effective', 'change goes effective after reconciliation');
end $$;

-- force-override path is logged
do $$ declare doc uuid; v0 uuid; v1 uuid; cc uuid;
begin
  select document_id, version_id into doc, v0 from app.create_document((select tenant_id from t),
    (select org_id from t),(select qa_department_id from t),'Force Doc', null, gen_random_uuid(), gen_random_uuid());
  perform app.transition_version(v0,'in_approval', gen_random_uuid());
  perform app.transition_version(v0,'approved', gen_random_uuid());
  perform app.make_effective(v0, gen_random_uuid());
  v1 := app.add_revision(doc, gen_random_uuid());
  perform app.transition_version(v1,'in_approval', gen_random_uuid());
  perform app.transition_version(v1,'approved', gen_random_uuid());
  insert into change_controls(id, tenant_id, org_id, department_id, type, status, classification, requester_id)
    values (gen_random_uuid(),(select tenant_id from t),(select org_id from t),(select qa_department_id from t),
            'CHANGE_SINGLE','pending_reconciliation','minor','55550000-0000-0000-0000-000000000002') returning id into cc;
  insert into change_control_documents(change_control_id, document_id, target_version_id) values (cc, doc, v1);
  perform public.issue_controlled_copy(v0, 'contract site');
  perform public.reconcile_cc(cc, 'contract site closed in a fire');   -- forced
end $$;
select assert(exists(select 1 from audit_trail where action='reconciliation.forced'),
  'a forced reconciliation is logged with its reason');
select set_config('request.jwt.claims', null, true);
