-- Training module acceptance (TRAINING_MODULE_BUILD_PLAN §12 walkthrough +
-- guards): human gate, version-specificity, server-side grading, append-only
-- attempts, retakes, certificates, threshold→seam→release, execution block.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at)
select id,'authenticated','authenticated',id::text||'@a.test','{}',now(),now() from (values
  ('77770000-0000-0000-0000-000000000001'::uuid),  -- employee/author
  ('77770000-0000-0000-0000-000000000002'),        -- hod
  ('77770000-0000-0000-0000-000000000003'),        -- qa
  ('77770000-0000-0000-0000-000000000004'),        -- trainer
  ('77770000-0000-0000-0000-000000000005'),        -- trainee 1
  ('77770000-0000-0000-0000-000000000006'),        -- trainee 2
  ('77770000-0000-0000-0000-000000000007')) v(id); -- trainee 3 (straggler)
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role)
select id,(select tenant_id from t),(select org_id from t),(select qa_department_id from t),
  id::text||'@a.test','org','author'
from (values ('77770000-0000-0000-0000-000000000001'::uuid),('77770000-0000-0000-0000-000000000002'),
  ('77770000-0000-0000-0000-000000000003'),('77770000-0000-0000-0000-000000000004'),
  ('77770000-0000-0000-0000-000000000005'),('77770000-0000-0000-0000-000000000006'),
  ('77770000-0000-0000-0000-000000000007')) v(id);
insert into public.user_roles(user_id, tenant_id, role, department_id) values
  ('77770000-0000-0000-0000-000000000002',(select tenant_id from t),'hod',(select qa_department_id from t)),
  ('77770000-0000-0000-0000-000000000003',(select tenant_id from t),'qa',null),
  ('77770000-0000-0000-0000-000000000004',(select tenant_id from t),'trainer',(select qa_department_id from t));

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;

-- Module ON with a 66% threshold (the walkthrough's "threshold at 66% answers met").
insert into public.tenant_modules(tenant_id, module_key, enabled, config)
  values ((select tenant_id from t),'training', true, '{"threshold":66}'::jsonb);

-- QA-owned settings: pass mark 80, 3 attempts max.
select pg_temp.as_user('77770000-0000-0000-0000-000000000003');
select public.set_training_settings(80, 3, 14);
select assert((select pass_mark from training_settings where tenant_id=(select tenant_id from t)) = 80,
  'training settings stored');

-- Branding: logo + name now, colors stay null until onboarding (plan §5).
select public.set_tenant_branding('Acme Pharma GH', 'logo://acme.png');
select assert((select color_primary is null and org_display_name='Acme Pharma GH'
               from tenant_branding where tenant_id=(select tenant_id from t)),
  'branding holds logo/name with colors unset (onboarding fills them later)');

-- ============ A document reaches the training gate through the real pipe ============
create temp table doc on commit drop as select null::uuid as id, null::uuid as ver;
do $$ declare d uuid; req uuid; qareq uuid; outcome text;
begin
  select document_id into d from app.create_document((select tenant_id from t),(select org_id from t),
    (select qa_department_id from t),'Aseptic Filling SOP','SOP-77',
    '77770000-0000-0000-0000-000000000001','77770000-0000-0000-0000-000000000001','ref','initial issue');
  perform pg_temp.as_user('77770000-0000-0000-0000-000000000001');
  req := public.submit_document(d);
  perform pg_temp.as_user('77770000-0000-0000-0000-000000000002');
  perform public.endorse_request(req);
  select id into qareq from approval_requests where document_id=d and stage='qa_review' and status='pending';
  perform pg_temp.as_user('77770000-0000-0000-0000-000000000003');
  outcome := public.qa_approve(qareq, true, null);
  perform assert(outcome = 'pending_training', 'training-required approval holds at the gate');
  update pg_temp.doc set id = d, ver = (select id from document_versions where document_id=d and status='approved');
end $$;

-- ============ Package: generate → human gate → edit → approve ============
create temp table pkg on commit drop as select null::uuid as id;
do $$ declare p uuid; s1 uuid; s2 uuid; s3 uuid; q_del uuid;
begin
  perform pg_temp.as_user('77770000-0000-0000-0000-000000000004');       -- the trainer
  p := public.create_training_package((select ver from pg_temp.doc), 'visual-steps', 3, null);
  update pg_temp.pkg set id = p;

  -- The gateway stores what the AI produced (drafts, provenance retained).
  perform public.store_ai_draft(p,
    '[{"title":"Purpose","body":"Why aseptic filling is controlled."},
      {"title":"Key steps","body":"Gowning, line clearance, filling, checks."}]'::jsonb,
    '[{"question":"When is line clearance performed?","options":["Before filling","After filling","Never"],"correct_index":0},
      {"question":"Who approves deviations?","options":["Anyone","QA","The intern"],"correct_index":1},
      {"question":"What is worn in the filling suite?","options":["Street clothes","Sterile gown"],"correct_index":1}]'::jsonb,
    'gemini','gemini-2.5-flash-test', 'the pasted SOP grounding text',
    '{"prompt_tokens":500,"completion_tokens":277,"total_tokens":777}'::jsonb);
  perform assert((select state from training_packages where id=p) = 'draft_review',
    'AI output lands as a DRAFT awaiting human review');
  perform assert((select count(*) from ai_gateway_log where package_id=p and status='success') = 1,
    'AI provenance logged (operation, provider, model, requester, version)');
  perform assert((select total_tokens from ai_gateway_log where package_id=p and status='success') = 777,
    'token usage is metered on the provenance log (billing/insight substrate)');
  perform assert((public.ai_usage_guard()->>'used_last_hour')::int >= 1,
    'the rate guard reads live per-tenant usage');
  perform assert(((public.ai_usage_summary(30))->'totals'->>'total_tokens')::int = 777,
    'tenant usage summary aggregates tokens');

  -- Human gate: an unapproved package can NEVER be assigned.
  begin
    perform public.assign_training_package(p, array['77770000-0000-0000-0000-000000000005'::uuid], null);
    raise exception 'expected human-gate rejection';
  exception when others then
    if sqlerrm not like '%APPROVED%' then raise; end if;
  end;

  -- The trainer polishes the draft: inline edit, add, reorder, delete+add question.
  select id into s1 from training_slides where package_id=p and position=1;
  perform public.update_training_slide(s1, 'Purpose & scope', 'Why aseptic filling is controlled, and where this SOP applies.');
  perform assert((select ai_draft->>'title' from training_slides where id=s1) = 'Purpose',
    'the AI draft is preserved alongside the human edit (provenance)');
  s3 := public.add_training_slide(p, 'Critical points', 'Interventions require line clearance.');
  select id into s2 from training_slides where package_id=p and position=2;
  perform public.reorder_training_slides(p, array[s1, s3, s2]);
  perform assert((select title from training_slides where package_id=p and position=2) = 'Critical points',
    'drag-and-drop order persists');
  -- Insert AT a position: everything below shifts, numbering stays contiguous.
  perform public.add_training_slide(p, 'Inserted', 'between one and two', 2);
  perform assert((select title from training_slides where package_id=p and position=2) = 'Inserted'
             and (select title from training_slides where package_id=p and position=3) = 'Critical points',
    'insert-at-position shifts the deck down automatically');
  perform assert((select array_agg(position order by position) from training_slides where package_id=p)
                 = (select array_agg(g) from generate_series(1, (select count(*)::int from training_slides where package_id=p)) g),
    'slide numbering is contiguous and self-checking');
  perform public.delete_training_slide((select id from training_slides where package_id=p and position=2));
  perform assert((select array_agg(position order by position) from training_slides where package_id=p)
                 = array[1,2,3], 'delete compacts the numbering back');
  select id into q_del from training_questions where package_id=p and position=3;
  perform public.delete_training_question(q_del);
  perform public.add_training_question(p, 'What gown is worn in the filling suite?',
    '["Street clothes","Sterile gown","Lab coat"]'::jsonb, 1, 'Gowning SOP section 4.');
  -- Insert a question at position 1, then remove it: numbering self-checks both ways.
  perform public.add_training_question(p, 'Temp first question?', '["A","B"]'::jsonb, 0, null, 1);
  perform assert((select question from training_questions where package_id=p and position=1) = 'Temp first question?'
             and (select count(*) from training_questions where package_id=p) = 4,
    'insert-at-position works for questions');
  perform public.delete_training_question((select id from training_questions where package_id=p and position=1));
  perform assert((select array_agg(position order by position) from training_questions where package_id=p)
                 = array[1,2,3], 'question numbering compacts automatically');
  perform assert((select count(*) from training_questions where package_id=p) = 3, 'three questions after polish');

  perform public.approve_training_package(p);
  perform assert((select state from training_packages where id=p) = 'approved',
    'trainer approval is the gate out of draft review');
end $$;

-- Content edits are locked after approval (the approved record is fixed).
select assert_raises(
  $$select public.add_training_slide((select id from pg_temp.pkg), 'sneak', 'edit after approval')$$,
  'content is frozen once approved');

-- ============ Assign 3 trainees ============
do $$ declare n int;
begin
  perform pg_temp.as_user('77770000-0000-0000-0000-000000000004');
  n := public.assign_training_package((select id from pg_temp.pkg),
    array['77770000-0000-0000-0000-000000000005'::uuid,'77770000-0000-0000-0000-000000000006',
          '77770000-0000-0000-0000-000000000007'], null);
  perform assert(n = 3, 'three assignments created');
  perform assert((select state from training_packages where id=(select id from pg_temp.pkg)) = 'assigned',
    'package goes live on first assignment');
end $$;

-- Release is blocked while 0 of 3 have completed (threshold 66%).
select pg_temp.as_user('77770000-0000-0000-0000-000000000004');
select assert_raises(
  $$select public.release_training((select id from pg_temp.doc))$$,
  'release refused below the training threshold');

-- ============ Trainee 1: slides → assessment → pass (all correct) ============
do $$ declare a uuid; content jsonb; answers jsonb; result jsonb;
begin
  perform pg_temp.as_user('77770000-0000-0000-0000-000000000005');
  select id into a from training_assignments
    where package_id=(select id from pg_temp.pkg) and user_id='77770000-0000-0000-0000-000000000005';
  content := public.get_training_content(a);
  perform assert(jsonb_array_length(content->'slides') = 3, 'trainee receives the approved deck');
  perform assert(content::text not like '%correct_index%', 'the deck payload carries no answers');
  perform assert((select status from training_assignments where id=a) = 'in_progress',
    'first open starts the assignment');
  perform public.save_training_progress(a, 40);                       -- resume point saved
  perform assert((select slide_progress_pct from training_assignments where id=a) = 40, 'progress persists');
  perform public.save_training_progress(a, 10);                       -- never backwards
  perform assert((select slide_progress_pct from training_assignments where id=a) = 40, 'progress is monotonic');
  perform public.save_training_progress(a, 100);
  perform assert((select status from training_assignments where id=a) = 'awaiting_assessment',
    'finishing the slides opens the assessment');

  content := public.get_assessment(a);
  perform assert(content::text not like '%correct_index%', 'assessment payload is stripped of answers');
  -- (Fixture privilege: build the correct answer key from the table.)
  select jsonb_object_agg(q.id::text, q.correct_index) into answers
    from training_questions q where q.package_id=(select id from pg_temp.pkg);
  result := public.submit_assessment(a, answers);
  perform assert((result->>'passed')::boolean and (result->>'score')::numeric = 100,
    'server-side grading: all correct = 100, passed');
  perform assert((result->>'certificate_uid') like 'CERT-%', 'certificate issued on pass');
  perform assert((select status from training_assignments where id=a) = 'completed', 'assignment completed');
end $$;

-- ============ Trainee 2: fails once, passes on the retake ============
do $$ declare a uuid; v_wrong jsonb; v_right jsonb; result jsonb;
begin
  perform pg_temp.as_user('77770000-0000-0000-0000-000000000006');
  select id into a from training_assignments
    where package_id=(select id from pg_temp.pkg) and user_id='77770000-0000-0000-0000-000000000006';
  perform public.get_training_content(a);
  perform public.save_training_progress(a, 100);
  select jsonb_object_agg(q.id::text, case when q.correct_index = 0 then 1 else 0 end) into v_wrong
    from training_questions q where q.package_id=(select id from pg_temp.pkg);
  result := public.submit_assessment(a, v_wrong);
  perform assert(not (result->>'passed')::boolean, 'all-wrong scores as a fail');
  perform assert((result->>'attempts_left')::int = 2, 'retake policy counts down');
  perform assert((select status from training_assignments where id=a) = 'awaiting_assessment',
    'a failed attempt leaves the assessment open');
  select jsonb_object_agg(q.id::text, q.correct_index) into v_right
    from training_questions q where q.package_id=(select id from pg_temp.pkg);
  result := public.submit_assessment(a, v_right);
  perform assert((result->>'passed')::boolean and (result->>'attempt_no')::int = 2,
    'passes on attempt 2; both attempts on the record');
  perform assert((select count(*) from assessment_attempts where assignment_id=a) = 2,
    'every attempt retained');
end $$;

-- Attempts are append-only at the DB.
select assert_raises($$update assessment_attempts set score=100 where passed=false$$,
  'attempts can never be rewritten');
select assert_raises($$delete from assessment_attempts$$, 'attempts can never be deleted');
select assert_raises($$update ai_gateway_log set model_version='forged'$$, 'AI provenance is append-only');

-- ============ Threshold 2/3 = 66.7% ≥ 66% → the seam answers "met" → release ============
select pg_temp.as_user('77770000-0000-0000-0000-000000000004');
select assert((public.training_threshold_status((select id from pg_temp.pkg))->>'met')::boolean,
  'threshold status reports met at 2 of 3');
select public.release_training((select id from pg_temp.doc));
select assert((select status from documents where id=(select id from pg_temp.doc)) = 'active',
  'threshold met → core releases the document');

-- ============ The straggler is blocked from execution until trained ============
do $$ begin
  -- trainee 1 trained → no block
  perform app.enforce_trained_for_execution('77770000-0000-0000-0000-000000000005', (select id from pg_temp.doc));
  -- trainee 3 untrained → blocked
  begin
    perform app.enforce_trained_for_execution('77770000-0000-0000-0000-000000000007', (select id from pg_temp.doc));
    raise exception 'expected execution block';
  exception when others then
    if sqlerrm not like '%execution blocked%' then raise; end if;
  end;
end $$;
select pg_temp.as_user('77770000-0000-0000-0000-000000000007');
select assert((public.my_training_status((select id from pg_temp.doc))->>'blocked')::boolean,
  'the straggler sees the block on the read surface');

-- Overdue is derived, never stored (plan §4.2/§8).
update training_assignments set due_at = now() - interval '1 day'
  where package_id=(select id from pg_temp.pkg) and user_id='77770000-0000-0000-0000-000000000007';
select assert(exists(select 1 from jsonb_array_elements(public.my_training()) x
    where (x->>'overdue')::boolean), 'the trainee sees the overdue flag');

-- ============ Certificates: content + verification ============
do $$ declare c record; v jsonb;
begin
  perform pg_temp.as_user('77770000-0000-0000-0000-000000000004');
  select * into c from certificates where trainee_id='77770000-0000-0000-0000-000000000005';
  perform assert(c.document_number = 'SOP-77' and c.revision_number = 0,
    'certificate snapshots number/title/REVISION (version-specific)');
  v := public.verify_certificate(c.certificate_uid);
  perform assert((v->>'valid')::boolean and (v->>'revision')::int = 0,
    'a paper certificate verifies against the record by uid');
  perform assert(not (public.verify_certificate('CERT-FORGED')->>'valid')::boolean,
    'an unknown uid does not verify');
end $$;

-- ============ Version-specificity: rev 01 needs NEW training ============
do $$ declare v2 uuid; p2 uuid;
begin
  v2 := app.add_revision((select id from pg_temp.doc), gen_random_uuid());
  perform app.transition_version(v2,'in_approval', gen_random_uuid());
  perform app.transition_version(v2,'approved', gen_random_uuid());
  perform pg_temp.as_user('77770000-0000-0000-0000-000000000004');
  p2 := public.create_training_package(v2, 'change-summary', 3, null);
  perform assert(app.is_user_trained('77770000-0000-0000-0000-000000000005',
      (select ver from pg_temp.doc)), 'training on rev 00 stands for rev 00');
  perform assert(not app.is_user_trained('77770000-0000-0000-0000-000000000005', v2),
    'training on rev 00 does NOT count for rev 01');
end $$;

-- ============ Seam event: supersession AUTO-CLOSES the old package ============
do $$ declare v2 uuid; p2 uuid; n int;
begin
  select id into v2 from document_versions
    where document_id = (select id from pg_temp.doc) and status = 'approved';
  -- finish the rev-01 package so it is assignable
  perform pg_temp.as_user('77770000-0000-0000-0000-000000000004');
  select id into p2 from training_packages where document_version_id = v2;
  perform public.store_ai_draft(p2,
    '[{"title":"What changed","body":"Rev 01 tightens line clearance."}]'::jsonb,
    '[{"question":"What did rev 01 change?","options":["Line clearance","Nothing"],"correct_index":0}]'::jsonb,
    'gemini','gemini-2.5-flash-test');
  perform public.approve_training_package(p2);
  -- bulk assignment: whole department in one audited call
  n := public.assign_training_package(p2, null, null, (select qa_department_id from t), null);
  perform assert(n = 7, 'assign-by-department resolves every active member (7)');

  -- make rev 01 effective → rev 00 superseded → its package closes itself
  perform app.make_effective(v2, gen_random_uuid());
  perform assert((select status from document_versions where id = (select ver from pg_temp.doc)) = 'superseded',
    'rev 00 superseded by rev 01');
  perform assert((select state from training_packages
                  where document_version_id = (select ver from pg_temp.doc)) = 'closed',
    'the superseded version''s package auto-closed (seam event)');
  perform assert(exists(select 1 from audit_trail where action = 'training.package_autoclosed'),
    'the auto-close is on the audit spine');
  -- completion is HISTORY: closing never revokes trained status for that version
  perform assert(app.is_user_trained('77770000-0000-0000-0000-000000000005', (select ver from pg_temp.doc)),
    'training completed on rev 00 remains on record after the package closes');
end $$;

-- ============ Trainer-only content: RLS hides questions from trainees ============
select pg_temp.as_user('77770000-0000-0000-0000-000000000005');
set local role authenticated;
select assert((select count(*) from training_questions) = 0,
  'trainees cannot read questions (and so never the correct answers)');
select assert((select count(*) from training_slides) = 0,
  'slides are served only through the audited door');
reset role;

-- ============ AI failure degrades gracefully (plan §3.5) ============
do $$ declare p3 uuid; d3 uuid; v3 uuid;
begin
  select document_id, version_id into d3, v3 from app.create_document((select tenant_id from t),
    (select org_id from t),(select qa_department_id from t),'Failure Path SOP', null,
    gen_random_uuid(), gen_random_uuid());
  perform app.transition_version(v3,'in_approval', gen_random_uuid());
  perform app.transition_version(v3,'approved', gen_random_uuid());
  perform pg_temp.as_user('77770000-0000-0000-0000-000000000004');
  p3 := public.create_training_package(v3, 'compact-brief', 3, null);
  perform public.log_ai_failure(p3, 'gemini', 'gemini-2.5-flash-test', 'provider timeout');
  perform assert((select state from training_packages where id=p3) = 'draft_review',
    'AI failure drops to draft review — the trainer authors manually or retries');
  perform assert(exists(select 1 from ai_gateway_log where package_id=p3 and status='error'),
    'the failure itself is on the provenance log');
end $$;

-- ============ Module OFF → safe default unchanged (core law) ============
update public.tenant_modules set enabled=false
  where tenant_id=(select tenant_id from t) and module_key='training';
do $$ begin
  perform app.enforce_trained_for_execution('77770000-0000-0000-0000-000000000007', (select id from pg_temp.doc));
end $$;
select pg_temp.as_user('77770000-0000-0000-0000-000000000007');
select assert(not (public.my_training_status((select id from pg_temp.doc))->>'blocked')::boolean,
  'module off → no execution block (safe default)');
select set_config('request.jwt.claims', null, true);

-- The audit story exists for the whole journey.
select assert(
  (select count(distinct action) from audit_trail where action in
    ('training.package_created','training.ai_generated','training.slide_edited','training.slides_reordered',
     'training.package_approved','training.assigned','training.started','training.slides_completed',
     'assessment.submitted','certificate.issued','training.ai_failed','training.settings_set','branding.set')) = 13,
  'every training action is on the audit spine');
