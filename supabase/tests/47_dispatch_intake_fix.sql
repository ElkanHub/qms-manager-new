-- Regression: dispatch_intake routes ALL three types. The numbering_v2 replace
-- had silently dropped the RETIRE branch (an intake was marked dispatched with
-- no retirement request created). Also proves NEW_SOP dispatch still numbers
-- the new document and CHANGE dispatch opens the change control.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('47470000-0000-0000-0000-000000000001','authenticated','authenticated','req@a.test','{}',now(),now()),
  ('47470000-0000-0000-0000-000000000002','authenticated','authenticated','qa@a.test','{}',now(),now());
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('47470000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'req@a.test','org',null),
  ('47470000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa');
insert into public.user_roles(user_id, tenant_id, role) values
  ('47470000-0000-0000-0000-000000000002',(select tenant_id from t),'qa');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true); $$;
create or replace function pg_temp.mkeff(p_title text) returns uuid language plpgsql as $$
declare doc uuid; ver uuid; begin
  select document_id, version_id into doc, ver from app.create_document((select tenant_id from t),
    (select org_id from t),(select qa_department_id from t), p_title, null, gen_random_uuid(), gen_random_uuid());
  perform app.transition_version(ver,'in_approval', gen_random_uuid());
  perform app.transition_version(ver,'approved', gen_random_uuid());
  perform app.make_effective(ver, gen_random_uuid());
  return doc; end $$;

-- NEW_SOP: dispatch creates the draft document and numbers it.
do $$ declare intake uuid; inferred text; created uuid;
begin
  perform pg_temp.as_user('47470000-0000-0000-0000-000000000001');
  select intake_id, inferred_type into intake, inferred
    from public.start_intake('need a cleaning SOP', 'Cleaning of Mixers', null, false, 'ref.docx');
  perform assert(inferred = 'NEW_SOP', 'no targets → NEW_SOP inferred');
  created := public.dispatch_intake(intake);
  perform assert((select document_number from documents where id = created) is not null,
    'the new document is numbered at dispatch');
  perform assert(exists(select 1 from document_versions where document_id = created and status = 'draft'),
    'a draft version exists — the author''s next step');
end $$;

-- RETIRE: dispatch must actually file the retirement request (the regression).
do $$ declare doc uuid; intake uuid; inferred text; ret uuid;
begin
  doc := pg_temp.mkeff('To Discontinue');
  perform pg_temp.as_user('47470000-0000-0000-0000-000000000001');
  select intake_id, inferred_type into intake, inferred
    from public.start_intake('process discontinued', null, array[doc], true, null);
  perform assert(inferred = 'RETIRE', 'target + discontinue → RETIRE inferred');
  ret := public.dispatch_intake(intake);
  perform assert(ret is not null, 'RETIRE dispatch returns the retirement id');
  perform assert(exists(select 1 from retirements where id = ret and document_id = doc),
    'the retirement request was actually created (regression: it was silently dropped)');
end $$;

-- CHANGE: dispatch opens the change control.
do $$ declare doc uuid; intake uuid; cc uuid;
begin
  doc := pg_temp.mkeff('To Amend');
  perform pg_temp.as_user('47470000-0000-0000-0000-000000000001');
  select intake_id into intake
    from public.start_intake('update step 4', null, array[doc], false, null);
  cc := public.dispatch_intake(intake);
  perform assert(exists(select 1 from change_controls where id = cc),
    'CHANGE dispatch opens the change control');
end $$;

select set_config('request.jwt.claims', null, true);
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact after the dispatch round');
