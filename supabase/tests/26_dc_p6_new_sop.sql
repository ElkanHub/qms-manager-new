-- DC Phase 6 acceptance: HOD path vs manager path, fallback, training seam,
-- scheduling, reject-preserves, SoD (QA != author/submitter).
-- RPCs are SECURITY DEFINER + read auth.uid() from the jwt claim, so we just set
-- the claim per actor (no role switch needed).

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('22220000-0000-0000-0000-000000000001','authenticated','authenticated','emp@a.test','{}',now(),now()),
  ('22220000-0000-0000-0000-000000000002','authenticated','authenticated','hod@a.test','{}',now(),now()),
  ('22220000-0000-0000-0000-000000000003','authenticated','authenticated','qa@a.test','{}',now(),now());
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('22220000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'emp@a.test','org','author'),
  ('22220000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'hod@a.test','org','hod');
insert into public.user_roles(user_id, tenant_id, role, department_id) values
  ('22220000-0000-0000-0000-000000000002',(select tenant_id from t),'hod',(select qa_department_id from t));
do $$ declare tok text; begin
  select token into tok from app.create_invitation('qa@a.test','org','qa',
    (select tenant_id from t),(select org_id from t),(select qa_department_id from t));
  perform public.accept_invitation(tok,'22220000-0000-0000-0000-000000000003','qa@a.test');
end $$;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;
create or replace function pg_temp.mkdoc(p_owner uuid, p_title text) returns uuid language plpgsql as $$
declare v uuid;
begin
  select document_id into v from app.create_document((select tenant_id from t),(select org_id from t),
    (select qa_department_id from t), p_title, null, p_owner, p_owner, 'ref', 'because');
  return v;
end $$;

-- === Employee path: submit → HOD endorse → QA approve → active ===
do $$ declare doc uuid; req uuid; hodreq uuid; qareq uuid; outcome text;
begin
  doc := pg_temp.mkdoc('22220000-0000-0000-0000-000000000001','Employee SOP');
  perform pg_temp.as_user('22220000-0000-0000-0000-000000000001');
  req := public.submit_document(doc);
  perform assert((select stage from approval_requests where id=req)='hod_review', 'employee submission goes to HOD review');

  perform pg_temp.as_user('22220000-0000-0000-0000-000000000002');   -- HOD endorses
  perform public.endorse_request(req);
  select id into qareq from approval_requests where document_id=doc and stage='qa_review' and status='pending';
  perform assert(qareq is not null, 'endorsement creates the QA review');

  perform pg_temp.as_user('22220000-0000-0000-0000-000000000003');   -- QA approves (training off → active)
  outcome := public.qa_approve(qareq, false, null);
  perform assert(outcome='active', 'new SOP goes effective (no training gate when module off)');
  perform assert((select revision_number from document_versions where document_id=doc and status='effective')=0,
    'first effective is revision 00');
end $$;

-- === Manager path + HOD-is-submitter fallback ===
do $$ declare doc uuid; req uuid;
begin
  doc := pg_temp.mkdoc('22220000-0000-0000-0000-000000000002','HOD-authored SOP');
  perform pg_temp.as_user('22220000-0000-0000-0000-000000000002');   -- HOD submits their own doc
  req := public.submit_document(doc);
  perform assert((select stage from approval_requests where id=req)='qa_review',
    'manager/HOD submission skips straight to QA');
end $$;
select assert(exists(select 1 from audit_trail where action='endorsement.fallback'),
  'HOD-is-submitter fallback is logged');

-- === Training seam ON → pending_training, then release ===
insert into public.tenant_modules(tenant_id, module_key, enabled, config)
  values ((select tenant_id from t),'training', true, '{"assume_met":false}'::jsonb);
do $$ declare doc uuid; req uuid; qareq uuid; outcome text;
begin
  doc := pg_temp.mkdoc('22220000-0000-0000-0000-000000000001','Trained SOP');
  perform pg_temp.as_user('22220000-0000-0000-0000-000000000001');
  req := public.submit_document(doc);
  perform pg_temp.as_user('22220000-0000-0000-0000-000000000002');
  perform public.endorse_request(req);
  select id into qareq from approval_requests where document_id=doc and stage='qa_review' and status='pending';
  perform pg_temp.as_user('22220000-0000-0000-0000-000000000003');
  outcome := public.qa_approve(qareq, true, null);
  perform assert(outcome='pending_training', 'with training on and threshold unmet, the doc waits for training');
  perform public.release_training(doc);
  perform assert((select status from documents where id=doc)='active', 'releasing training makes it effective');
end $$;

-- === Future effective date → scheduled → activated when due ===
do $$ declare doc uuid; req uuid; qareq uuid;
begin
  doc := pg_temp.mkdoc('22220000-0000-0000-0000-000000000001','Scheduled SOP');
  perform pg_temp.as_user('22220000-0000-0000-0000-000000000001');
  req := public.submit_document(doc);
  perform pg_temp.as_user('22220000-0000-0000-0000-000000000002');
  perform public.endorse_request(req);
  select id into qareq from approval_requests where document_id=doc and stage='qa_review' and status='pending';
  perform pg_temp.as_user('22220000-0000-0000-0000-000000000003');
  perform public.qa_approve(qareq, false, (current_date + 30));
  perform assert((select status from documents where id=doc)='scheduled', 'future date holds the doc in scheduled');
  -- make it due and run the activation job
  update document_versions set scheduled_for = now() - interval '1 day' where document_id=doc and status='approved';
  perform assert(public.activate_scheduled() >= 1, 'the scheduled job activates due documents');
  perform assert((select status from documents where id=doc)='active', 'scheduled doc becomes active when due');
end $$;

-- === Reject preserves the draft + reason ===
do $$ declare doc uuid; req uuid;
begin
  doc := pg_temp.mkdoc('22220000-0000-0000-0000-000000000001','Rejected SOP');
  perform pg_temp.as_user('22220000-0000-0000-0000-000000000001');
  req := public.submit_document(doc);
  perform pg_temp.as_user('22220000-0000-0000-0000-000000000003');
  perform public.reject_request(req, 'not acceptable');
  perform assert((select status from documents where id=doc)='draft', 'reject returns the document to draft');
  perform assert((select count(*) from document_versions where document_id=doc) >= 1, 'the draft version is preserved');
end $$;
select assert(exists(select 1 from audit_trail where action='document.rejected' and reason='not acceptable'),
  'rejection reason is retained in the audit trail');

-- === SoD: QA cannot approve a document they authored ===
do $$ declare doc uuid; req uuid;
begin
  perform pg_temp.as_user('22220000-0000-0000-0000-000000000003');    -- QA authors + submits
  doc := pg_temp.mkdoc('22220000-0000-0000-0000-000000000003','QA-authored SOP');
  req := public.submit_document(doc);   -- manager path → qa_review
  begin
    perform public.qa_approve(req, false, null);
    raise exception 'expected SoD rejection';
  exception when others then
    if sqlerrm not like '%segregation of duties%' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claims', null, true);
