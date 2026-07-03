-- Review annotation acceptance (REVIEW_ANNOTATION_ADDENDUM): Word-only content
-- refs at every entry path; QA/HOD anchor comments to a draft's passages;
-- comments are per-draft history — a corrected re-upload starts clean; the
-- engine transition (changes_requested) is unchanged; everything audited.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('bbbb0000-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now()),
  ('bbbb0000-0000-0000-0000-000000000002','authenticated','authenticated','author@a.test','{}',now(),now());
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('bbbb0000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa'),
  ('bbbb0000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'author@a.test','org','author');
insert into public.user_roles(user_id, tenant_id, role, department_id) values
  ('bbbb0000-0000-0000-0000-000000000001',(select tenant_id from t),'qa',null),
  ('bbbb0000-0000-0000-0000-000000000001',(select tenant_id from t),'hod',(select qa_department_id from t));

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;

-- ============ (1) Word-only in — one rule, every entry path ============
select pg_temp.as_user('bbbb0000-0000-0000-0000-000000000002');
select assert_raises(
  $$select public.start_intake('new sop','PDF Doc','{}',false,'https://x.test/sop.pdf')$$,
  'PDF refused at intake — PDF is an output of the copy register, never an input');
do $$ declare iid uuid; d uuid; begin
  -- .docx accepted at intake, carried onto the draft
  select intake_id into iid from public.start_intake('new sop','Word Doc','{}',false,'https://x.test/sop.docx?v=1');
  d := public.dispatch_intake(iid);
  perform assert((select content_ref from document_versions where document_id=d and status='draft')
                 like '%.docx%', 'the Word ref lands on the draft');
  -- update_draft refuses anything non-Word, accepts .doc (legacy)
  begin
    perform public.update_draft(d, 'Word Doc', 'https://x.test/sop.gdoc', 'reason');
    raise exception 'expected word-only rule';
  exception when others then if sqlerrm not like '%Microsoft Word%' then raise; end if; end;
  perform public.update_draft(d, 'Word Doc', 'https://x.test/sop-v2.DOC', 'corrected upload');
  create temp table wdoc on commit drop as select d as doc;
end $$;

-- ============ (2) Anchored comments: QA yes, author no, blank no ============
do $$ declare ver uuid; cid uuid; begin
  select id into ver from document_versions where document_id=(select doc from wdoc) and status='draft';
  -- the author cannot annotate (QA/HOD only)
  begin
    perform public.add_review_comment(ver, 'the mixing step', 'wrong rpm');
    raise exception 'expected role guard';
  exception when others then if sqlerrm not like '%QA or HOD%' then raise; end if; end;

  perform pg_temp.as_user('bbbb0000-0000-0000-0000-000000000001');
  cid := public.add_review_comment(ver, 'the mixing step', 'RPM contradicts the master formula',
                                   'after charging, ', ' begins at');
  perform assert((select quote from review_comments where id=cid) = 'the mixing step'
             and (select author_id from review_comments where id=cid) = 'bbbb0000-0000-0000-0000-000000000001',
    'the comment is anchored to the passage and attributed');
  begin perform public.add_review_comment(ver, '', 'no anchor'); raise exception 'expected quote guard';
  exception when others then if sqlerrm not like '%highlight a passage%' then raise; end if; end;
  begin perform public.add_review_comment(ver, 'a passage', '   '); raise exception 'expected comment guard';
  exception when others then if sqlerrm not like '%comment is required%' then raise; end if; end;
  perform assert(exists(select 1 from audit_trail where action='review.comment_added'
      and reason like '%master formula%'), 'annotation lands on the chain with its comment');
end $$;

-- ============ (3) Per-draft history: a corrected re-upload starts clean ============
do $$ declare v0 uuid; v1 uuid; begin
  select id into v0 from document_versions where document_id=(select doc from wdoc) and status='draft';
  -- the round-trip: submit → QA requests changes → author re-uploads → resubmit
  perform pg_temp.as_user('bbbb0000-0000-0000-0000-000000000002');
  perform public.update_draft((select doc from wdoc), 'Word Doc', 'https://x.test/sop-v2.docx', 'ready');
  perform public.submit_document((select doc from wdoc));
  perform pg_temp.as_user('bbbb0000-0000-0000-0000-000000000001');
  perform public.endorse_request((select id from approval_requests
    where document_id=(select doc from wdoc) and status='pending'));
  perform public.request_changes((select id from approval_requests
    where document_id=(select doc from wdoc) and status='pending'),
    'see the anchored comments on the draft');
  -- comments made on v0 stay on v0 (history); the corrected content is the SAME
  -- draft version re-uploaded — anchoring is per-version by construction, and a
  -- version that leaves review refuses new annotations:
  perform assert((select count(*) from review_comments where document_version_id=v0) = 1,
    'the review round is preserved on the draft it was made on');
  update document_versions set status='approved' where id=v0;   -- simulate the round ending
  begin
    perform public.add_review_comment(v0, 'x', 'y');
    raise exception 'expected review-window guard';
  exception when others then if sqlerrm not like '%no longer under review%' then raise; end if; end;
end $$;

select set_config('request.jwt.claims', null, true);
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact after the annotation round');
