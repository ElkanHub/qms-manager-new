-- DC Phase 7 acceptance: impact hard gate, classification→signing set + completion,
-- waiver (admin+reason+logged), concurrency queue, atomic supersession, effectiveness
-- review independence.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

-- users + roles (roles read live from user_roles; no invite dance needed)
insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at)
select id,'authenticated','authenticated',id::text||'@a.test','{}',now(),now() from (values
  ('33330000-0000-0000-0000-000000000001'::uuid),('33330000-0000-0000-0000-000000000002'),
  ('33330000-0000-0000-0000-000000000003'),('33330000-0000-0000-0000-000000000004'),
  ('33330000-0000-0000-0000-000000000005'),('33330000-0000-0000-0000-000000000006')) v(id);
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role)
select id,(select tenant_id from t),(select org_id from t),(select qa_department_id from t), id::text, 'org','author'
from (values ('33330000-0000-0000-0000-000000000001'::uuid),('33330000-0000-0000-0000-000000000002'),
  ('33330000-0000-0000-0000-000000000003'),('33330000-0000-0000-0000-000000000004'),
  ('33330000-0000-0000-0000-000000000005'),('33330000-0000-0000-0000-000000000006')) v(id);
insert into public.user_roles(user_id, tenant_id, role, department_id) values
  ('33330000-0000-0000-0000-000000000002',(select tenant_id from t),'qa',null),         -- qa
  ('33330000-0000-0000-0000-000000000003',(select tenant_id from t),'qa',null),         -- qa2
  ('33330000-0000-0000-0000-000000000004',(select tenant_id from t),'hod',(select qa_department_id from t)),
  ('33330000-0000-0000-0000-000000000005',(select tenant_id from t),'signatory',null),
  ('33330000-0000-0000-0000-000000000006',(select tenant_id from t),'org_admin',null);

-- signing v2: signers must have a signature on file (onboarding collects it)
insert into public.user_signatures(user_id, tenant_id, image_data, source)
  select u.id, u.tenant_id, 'data:image/png;base64,' || repeat('iVBORw0KGgoAAAANSUhEUg', 20), 'drawn'
  from public.users u where u.tenant_id = (select tenant_id from t)
  on conflict (user_id) do nothing;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;
create or replace function pg_temp.mkeff(p_title text) returns uuid language plpgsql as $$
declare doc uuid; ver uuid;
begin
  select document_id, version_id into doc, ver from app.create_document((select tenant_id from t),
    (select org_id from t),(select qa_department_id from t), p_title, null, gen_random_uuid(), gen_random_uuid());
  perform app.transition_version(ver,'in_approval', gen_random_uuid());
  perform app.transition_version(ver,'approved', gen_random_uuid());
  perform app.make_effective(ver, gen_random_uuid());
  return doc;
end $$;

-- reusable complete impact assessment (minor: no training/reval/reg)
create or replace function pg_temp.impact_minor() returns jsonb language sql as $$
  select jsonb_build_object('documents_affected','yes','training_required',false,'templates_affected',false,
    'systems_touched','none','revalidation_needed',false,'regulatory_notification',false); $$;
create or replace function pg_temp.impact_critical() returns jsonb language sql as $$
  select jsonb_build_object('documents_affected','yes','training_required',false,'templates_affected',false,
    'systems_touched','LIMS','revalidation_needed',true,'regulatory_notification',true); $$;

-- ============ HAPPY PATH (minor) → atomic supersession + effectiveness → closed ============
do $$ declare doc uuid; cc uuid;
begin
  doc := pg_temp.mkeff('Change Target');
  perform pg_temp.as_user('33330000-0000-0000-0000-000000000001');           -- requester
  cc := public.create_change(array[doc], 'tweak wording');

  perform pg_temp.as_user('33330000-0000-0000-0000-000000000002');           -- QA
  perform public.begin_screening(cc);
  -- HARD GATE: classify with no impact → refused
  begin perform public.classify_cc(cc,'minor'); raise exception 'expected gate';
  exception when others then if sqlerrm not like '%hard gate%' then raise; end if; end;
  perform public.submit_impact(cc, pg_temp.impact_minor());
  perform public.classify_cc(cc,'minor');
  perform public.approve_for_work(cc);
  perform assert((select status from documents where id=doc)='locked_in_cc', 'target document is locked in CC');
  perform public.open_document_work(cc);
  perform public.review_cc_document(cc, doc);
  perform assert((select status from change_controls where id=cc)='signatures_pending', 'advances to signatures');
  perform assert((select count(*) from signatures where change_control_id=cc)=1, 'minor requires exactly one (QA) signature');
  perform public.apply_signature(cc, 'approved');                            -- QA signs the qa slot
  perform assert((select status from change_controls where id=cc)='pending_reconciliation', 'completion → reconciliation');
  perform public.reconcile_cc(cc);                                           -- register off → passes → effective
  perform assert((select status from change_controls where id=cc)='effective', 'reconciled → effective');

  -- atomic supersession: exactly one effective, predecessor superseded, new rev 01
  perform assert((select count(*) from document_versions where document_id=doc and status='effective')=1,
    'exactly one effective version after the change');
  perform assert((select revision_number from document_versions where document_id=doc and status='effective')=1,
    'the change produced revision 01');
  perform assert((select count(*) from document_versions where document_id=doc and status='superseded')=1,
    'the predecessor was superseded');

  -- effective→closed impossible without the review step
  begin perform public.close_cc(cc,'done'); raise exception 'expected review-required';
  exception when others then if sqlerrm not like '%effectiveness review%' then raise; end if; end;
  perform public.enter_effectiveness_review(cc);
  perform public.close_cc(cc, 'objective met');
  perform assert((select status from change_controls where id=cc)='closed', 'closed after independent review');
end $$;

-- ============ CLASSIFICATION drives signing set; WAIVER (admin) ============
do $$ declare doc uuid; cc uuid;
begin
  doc := pg_temp.mkeff('Critical Target');
  perform pg_temp.as_user('33330000-0000-0000-0000-000000000001');
  cc := public.create_change(array[doc], 'validated parameter change');
  perform pg_temp.as_user('33330000-0000-0000-0000-000000000002');
  perform public.begin_screening(cc);
  perform public.submit_impact(cc, pg_temp.impact_critical());
  perform public.classify_cc(cc, 'critical');                               -- matches proposed
  perform public.approve_for_work(cc);
  perform public.open_document_work(cc);
  perform public.review_cc_document(cc, doc);
  perform assert((select count(*) from signatures where change_control_id=cc)=3, 'critical requires three signatures (qa,hod,signatory)');
  perform public.apply_signature(cc, 'approve');                            -- qa
  perform pg_temp.as_user('33330000-0000-0000-0000-000000000004');
  perform public.apply_signature(cc, 'endorse');                            -- hod
  -- signatory left the company → admin waives the remaining slot (reason logged)
  perform pg_temp.as_user('33330000-0000-0000-0000-000000000006');
  perform public.waive_signature(cc, 'signatory', 'signatory departed; approved by QA head');
  perform assert((select status from change_controls where id=cc)='pending_reconciliation',
    'signatures complete via sign+waiver → reconciliation');
end $$;
select assert(exists(select 1 from audit_trail where action='signature.waived' and reason like '%departed%'),
  'waiver is logged with its reason');
-- waiver is admin-only: a non-admin waiving is refused
do $$ declare doc uuid; cc uuid; begin
  doc := pg_temp.mkeff('Waiver Guard');
  perform pg_temp.as_user('33330000-0000-0000-0000-000000000001'); cc := public.create_change(array[doc],'x');
  perform pg_temp.as_user('33330000-0000-0000-0000-000000000002');
  perform public.begin_screening(cc); perform public.submit_impact(cc, pg_temp.impact_minor());
  perform public.classify_cc(cc,'minor'); perform public.approve_for_work(cc);
  perform public.open_document_work(cc); perform public.review_cc_document(cc, doc);
  begin perform public.waive_signature(cc,'qa','because'); raise exception 'expected admin-only';
  exception when others then if sqlerrm not like '%admin only%' then raise; end if; end;
end $$;

-- ============ CONCURRENCY: a locked document queues a second change ============
do $$ declare doc uuid; cc1 uuid; cc2 uuid;
begin
  doc := pg_temp.mkeff('Contended Doc');
  perform pg_temp.as_user('33330000-0000-0000-0000-000000000001');
  cc1 := public.create_change(array[doc],'first'); cc2 := public.create_change(array[doc],'second');
  perform pg_temp.as_user('33330000-0000-0000-0000-000000000002');
  perform public.begin_screening(cc1); perform public.submit_impact(cc1, pg_temp.impact_minor());
  perform public.classify_cc(cc1,'minor'); perform public.approve_for_work(cc1);   -- locks doc
  perform public.begin_screening(cc2); perform public.submit_impact(cc2, pg_temp.impact_minor());
  perform public.classify_cc(cc2,'minor');
  perform assert(public.approve_for_work(cc2)='queued', 'a second change on a locked document queues');
end $$;

-- ============ EFFECTIVENESS REVIEW independence (reviewer ≠ requester) ============
do $$ declare doc uuid; cc uuid;
begin
  doc := pg_temp.mkeff('Independence');
  perform pg_temp.as_user('33330000-0000-0000-0000-000000000003');           -- requester is qa2 (a QA)
  cc := public.create_change(array[doc],'change');
  perform pg_temp.as_user('33330000-0000-0000-0000-000000000002');           -- a DIFFERENT QA drives it
  perform public.begin_screening(cc); perform public.submit_impact(cc, pg_temp.impact_minor());
  perform public.classify_cc(cc,'minor'); perform public.approve_for_work(cc);
  perform public.open_document_work(cc); perform public.review_cc_document(cc, doc);
  perform public.apply_signature(cc,'approve'); perform public.reconcile_cc(cc);
  perform public.enter_effectiveness_review(cc);
  -- the requester (qa2), though a QA, cannot close their own change
  perform pg_temp.as_user('33330000-0000-0000-0000-000000000003');
  begin perform public.close_cc(cc,'self'); raise exception 'expected independence';
  exception when others then if sqlerrm not like '%segregation of duties%' then raise; end if; end;
end $$;
select set_config('request.jwt.claims', null, true);
