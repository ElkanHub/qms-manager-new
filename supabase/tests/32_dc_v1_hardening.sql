-- DC V1 hardening acceptance: signature SoD, impact substance, copies pre-check,
-- audited feedback path, usage summary, document story.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at)
select id,'authenticated','authenticated',id::text||'@a.test','{}',now(),now() from (values
  ('44440000-0000-0000-0000-000000000001'::uuid),  -- requester (holds hod)
  ('44440000-0000-0000-0000-000000000002'),        -- qa
  ('44440000-0000-0000-0000-000000000003'),        -- employee
  ('44440000-0000-0000-0000-000000000004')) v(id); -- a second hod
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role)
select id,(select tenant_id from t),(select org_id from t),(select qa_department_id from t),
  id::text||'@a.test','org','author'
from (values ('44440000-0000-0000-0000-000000000001'::uuid),('44440000-0000-0000-0000-000000000002'),
  ('44440000-0000-0000-0000-000000000003'),('44440000-0000-0000-0000-000000000004')) v(id);
insert into public.user_roles(user_id, tenant_id, role, department_id) values
  ('44440000-0000-0000-0000-000000000001',(select tenant_id from t),'hod',(select qa_department_id from t)),
  ('44440000-0000-0000-0000-000000000002',(select tenant_id from t),'qa',null),
  ('44440000-0000-0000-0000-000000000004',(select tenant_id from t),'hod',(select qa_department_id from t));

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

-- ============ (1) IMPACT GATE demands substance, not just keys ============
do $$ declare doc uuid; cc uuid; begin
  doc := pg_temp.mkeff('Substance Gate');
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000001');
  cc := public.create_change(array[doc],'wording');
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000002');
  perform public.begin_screening(cc);
  -- all six keys present, but one is blank → still incomplete
  perform public.submit_impact(cc, jsonb_build_object(
    'documents_affected','', 'training_required',false,'templates_affected',false,
    'systems_touched','none','revalidation_needed',false,'regulatory_notification',false));
  begin perform public.classify_cc(cc,'minor'); raise exception 'expected gate';
  exception when others then if sqlerrm not like '%hard gate%' then raise; end if; end;
  -- substantive values pass
  perform public.submit_impact(cc, jsonb_build_object(
    'documents_affected','this SOP only', 'training_required',false,'templates_affected',false,
    'systems_touched','none','revalidation_needed',false,'regulatory_notification',false));
  perform public.classify_cc(cc,'minor');
end $$;

-- ============ (2) SIGNATURE SoD: the requester cannot sign their own change ============
do $$ declare doc uuid; cc uuid; begin
  doc := pg_temp.mkeff('SoD Sign');
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000001');   -- requester, holds hod
  cc := public.create_change(array[doc],'self-sign attempt');
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000002');   -- QA drives the pipe
  perform public.begin_screening(cc);
  perform public.submit_impact(cc, jsonb_build_object(
    'documents_affected','this SOP','training_required',true,'templates_affected',false,
    'systems_touched','none','revalidation_needed',false,'regulatory_notification',false));
  perform public.classify_cc(cc,'major');                            -- major → qa + hod slots
  perform public.approve_for_work(cc);
  perform public.open_document_work(cc);
  perform public.review_cc_document(cc, doc);
  -- the requester holds the hod role, but may not fill a slot on their own change
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000001');
  begin perform public.apply_signature(cc,'endorse'); raise exception 'expected sod';
  exception when others then if sqlerrm not like '%segregation of duties%' then raise; end if; end;
  -- an independent hod and QA complete the set as usual
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000004');
  perform public.apply_signature(cc,'endorse');
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000002');
  perform public.apply_signature(cc,'approve');
  perform assert((select status from change_controls where id=cc)='pending_reconciliation',
    'independent signatures still complete the set');
end $$;

-- ============ (3) RETIREMENT pre-check: outstanding controlled copies block ============
do $$ declare doc uuid; ver uuid; cp uuid; ret uuid; begin
  doc := pg_temp.mkeff('Copies Gate');
  select id into ver from document_versions where document_id=doc and status='effective';
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000002');   -- QA issues a paper copy
  cp := public.issue_controlled_copy(ver, 'Lab bench 3');
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000003');   -- employee asks to retire
  ret := public.request_retirement(doc, 'process discontinued');
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000002');
  perform assert(not (app.retirement_prechecks(doc)->>'copies_reconciled')::boolean,
    'the outstanding copy is reported by the pre-check');
  begin perform public.approve_retirement(ret); raise exception 'expected precheck';
  exception when others then if sqlerrm not like '%pre-checks failed%' then raise; end if; end;
  perform public.reconcile_copy(cp, 'returned');
  perform public.approve_retirement(ret);
  perform assert((select status from retirements where id=ret)='retirement_approved',
    'retirement approves once the copy is reconciled');
end $$;

-- ============ (4) FEEDBACK: audited "flag this" path ============
select pg_temp.as_user('44440000-0000-0000-0000-000000000003');
select assert_raises($$select public.flag_feedback('', 'S-QA-REVIEW')$$, 'blank feedback refused');
select public.flag_feedback('The QA queue hides the reason column', 'S-QA-REVIEW');
select assert(exists(select 1 from audit_trail where action='feedback.flagged'
    and reason like '%reason column%' and chain_key=(select tenant_id from t)::text),
  'feedback lands on the tenant audit chain, attributable, with the message as reason');
select set_config('request.jwt.claims', null, true);
select assert_raises($$select public.flag_feedback('drive-by', null)$$, 'anonymous feedback refused');

-- ============ (5) USAGE summary from audit data (QA/admin only) ============
select pg_temp.as_user('44440000-0000-0000-0000-000000000002');
select assert(((public.usage_summary(30))->'funnel'->>'feedback_flags')::int >= 1,
  'flow funnel counts the feedback flag');
select assert(((public.usage_summary(30))->'funnel'->>'changes_opened')::int >= 2,
  'flow funnel counts opened changes');
select assert(jsonb_array_length((public.usage_summary(30))->'screens') > 0,
  'screen usage is visible from existing audit data');
select pg_temp.as_user('44440000-0000-0000-0000-000000000003');
select assert_raises($$select public.usage_summary(30)$$, 'usage summary is QA/org-admin only');

-- ============ (6) DOCUMENT STORY: one document's journey, chronological ============
do $$ declare doc uuid; n_doc_only bigint; ids bigint[]; begin
  perform pg_temp.as_user('44440000-0000-0000-0000-000000000002');
  select r.document_id into doc from retirements r limit 1;             -- the Copies Gate doc
  select array_agg(id) into ids from public.document_story(doc);
  select count(*) into n_doc_only from audit_trail
    where entity_type='document' and entity_id=doc::text;
  perform assert(coalesce(array_length(ids,1),0) > n_doc_only,
    'the story spans versions/copies/retirement, not just document-entity rows');
  perform assert(ids = (select array_agg(x order by x) from unnest(ids) x),
    'the story is chronological (chain order)');
end $$;
select set_config('request.jwt.claims', null, true);
