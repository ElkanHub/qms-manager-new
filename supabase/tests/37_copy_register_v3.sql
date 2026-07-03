-- Copy Register v3 acceptance — the build plan's §11 walkthrough:
-- a department requests controlled + display + uncontrolled copies → QA issues
-- all three → the document revises → reconciliation BLOCKS on the controlled +
-- display copies and never on the uncontrolled one → the change goes effective
-- → the register and the chain tell the whole story. Plus: anyone-requests/
-- only-QA-issues SoD, the decline path, config guards (formats,
-- allow_uncontrolled), and the derived register states.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('aaaa0000-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now()),
  ('aaaa0000-0000-0000-0000-000000000002','authenticated','authenticated','emp@a.test','{}',now(),now());
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('aaaa0000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa'),
  ('aaaa0000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'emp@a.test','org','author');
insert into public.user_roles(user_id, tenant_id, role) values
  ('aaaa0000-0000-0000-0000-000000000001',(select tenant_id from t),'qa');
insert into public.tenant_modules(tenant_id, module_key, enabled)
  values ((select tenant_id from t),'controlled_copies', true);

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

create temp table wd on commit drop as select pg_temp.mkeff('Walkthrough SOP') as doc;

-- ============ REQUEST: any department member; validation is real ============
select pg_temp.as_user('aaaa0000-0000-0000-0000-000000000002');
create temp table reqs on commit drop as select
  public.request_copy((select doc from wd), 'controlled',   'paper', 'Granulation room', 1, 'working copy at the line') as r_ctl,
  public.request_copy((select doc from wd), 'display',      'paper', 'Corridor noticeboard', 1, 'posted for display') as r_dsp,
  public.request_copy((select doc from wd), 'uncontrolled', 'pdf',   'External auditor', 1, 'for information') as r_unc;

select assert_raises($$select public.request_copy((select doc from wd), 'papyrus','paper','x',1,'p')$$,
  'copy type vocabulary enforced');
select assert_raises($$select public.request_copy((select doc from wd), 'controlled','fax','x',1,'p')$$,
  'format vocabulary enforced');
select assert_raises($$select public.request_copy((select doc from wd), 'controlled','paper','',1,'p')$$,
  'destination required');
select assert_raises($$select public.request_copy((select doc from wd), 'controlled','paper','x',0,'p')$$,
  'quantity bounds enforced');

-- The requester can never self-issue (anyone requests; ONLY QA issues).
select assert_raises($$select public.issue_copy_request((select r_ctl from reqs))$$,
  'a requester cannot issue their own request');

-- ============ ISSUE: QA reviews — declines one wrongly-aimed request… ============
select pg_temp.as_user('aaaa0000-0000-0000-0000-000000000001');
do $$ declare extra uuid; begin
  perform pg_temp.as_user('aaaa0000-0000-0000-0000-000000000002');
  extra := public.request_copy((select doc from wd), 'controlled', 'paper', 'Home office', 1, 'personal reference');
  perform pg_temp.as_user('aaaa0000-0000-0000-0000-000000000001');
  begin perform public.decline_copy_request(extra, ''); raise exception 'expected reason requirement';
  exception when others then if sqlerrm not like '%reason is required%' then raise; end if; end;
  perform public.decline_copy_request(extra, 'personal copies are not permitted');
  perform assert((select state from copy_requests where id=extra) = 'declined', 'declined with reason');
  begin perform public.issue_copy_request(extra); raise exception 'expected already-decided';
  exception when others then if sqlerrm not like '%already decided%' then raise; end if; end;
end $$;

-- …and issues the three good ones (each stamped onto the register with its type).
do $$ declare ids uuid[]; begin
  ids := public.issue_copy_request((select r_ctl from reqs));
  ids := ids || public.issue_copy_request((select r_dsp from reqs));
  ids := ids || public.issue_copy_request((select r_unc from reqs));
  perform assert(array_length(ids,1) = 3, 'three copies minted');
  perform assert((select count(*) from copy_requests where state='fulfilled') = 3, 'requests fulfilled');
  perform assert((select count(distinct copy_number) from controlled_copies
                  where document_version_id = (select current_version_id from documents where id=(select doc from wd)))
                 = 3, 'copy numbers stay unique per version across request issues');
  perform assert((select count(*) from copies_register where live_state='issued'
                  and document_id=(select doc from wd)) = 3, 'register: all three live');
end $$;

-- ============ REVISE the document → the type decides the behavior ============
do $$ declare v1 uuid; begin
  v1 := app.add_revision((select doc from wd), gen_random_uuid());
  perform app.transition_version(v1,'in_approval', gen_random_uuid());
  perform app.transition_version(v1,'approved', gen_random_uuid());
  perform app.make_effective(v1, gen_random_uuid());   -- supersedes v0
end $$;

select assert((select count(*) from copies_register where live_state='superseded_unreconciled') = 2,
  'controlled + display copies of the outgoing revision are flagged for recall');
select assert((select live_state from copies_register where copy_type='uncontrolled') = 'stale_uncontrolled',
  'the uncontrolled copy is noted as stale — informational only');
select assert((select count(*) from copies_recall_due) = 2,
  'the recall worklist holds exactly the two blocking copies');

-- ============ The change gate blocks on the blocking types only ============
do $$ declare doc uuid; v0 uuid; v1 uuid; cc uuid; c_ctl uuid; c_unc uuid; begin
  doc := pg_temp.mkeff('Gate SOP');
  select id into v0 from document_versions where document_id=doc and status='effective';
  v1 := app.add_revision(doc, gen_random_uuid());
  perform app.transition_version(v1,'in_approval', gen_random_uuid());
  perform app.transition_version(v1,'approved', gen_random_uuid());
  insert into change_controls(id, tenant_id, org_id, department_id, type, status, classification, requester_id)
    values (gen_random_uuid(),(select tenant_id from t),(select org_id from t),(select qa_department_id from t),
            'CHANGE_SINGLE','pending_reconciliation','minor','aaaa0000-0000-0000-0000-000000000002')
    returning id into cc;
  insert into change_control_documents(change_control_id, document_id, target_version_id, needs_training)
    values (cc, doc, v1, false);

  c_ctl := public.issue_controlled_copy(v0, 'Line 2', 'working copy', 'controlled', 'paper');
  c_unc := public.issue_controlled_copy(v0, 'Regulator', 'for information', 'uncontrolled', 'pdf');

  perform assert((select count(*) from public.outstanding_copies_for_cc(cc) where blocking) = 1
             and (select count(*) from public.outstanding_copies_for_cc(cc) where not blocking) = 1,
    'the worklist names both copies and marks only controlled/display as blocking');

  begin perform public.reconcile_cc(cc, null); raise exception 'expected outstanding block';
  exception when others then if sqlerrm not like '%outstanding%' then raise; end if; end;

  perform public.reconcile_copy(c_ctl, 'destroyed');
  -- the uncontrolled copy is STILL issued — and the gate passes anyway (§3)
  perform assert(public.reconcile_cc(cc, null) = 'effective',
    'an outstanding uncontrolled copy never blocks the change');
  perform assert((select status from controlled_copies where id=c_unc) = 'issued',
    'the uncontrolled copy stays on the register as a documented trace');
end $$;

-- ============ Retirement pre-check: same type-awareness ============
do $$ declare doc uuid; v0 uuid; begin
  doc := pg_temp.mkeff('Retire SOP');
  select id into v0 from document_versions where document_id=doc and status='effective';
  perform public.issue_controlled_copy(v0, 'Auditor pack', 'info', 'uncontrolled', 'pdf');
  perform assert((app.retirement_prechecks(doc)->>'copies_reconciled')::boolean,
    'uncontrolled copies never block retirement either');
  perform public.issue_controlled_copy(v0, 'Wall', 'posted', 'display', 'paper');
  perform assert(not (app.retirement_prechecks(doc)->>'copies_reconciled')::boolean,
    'a display copy blocks retirement until pulled');
end $$;

-- ============ Config guards: pdf-only tenant / uncontrolled forbidden ============
update public.tenant_modules
  set config = '{"formats":["pdf"],"allow_uncontrolled":false}'::jsonb
  where tenant_id=(select tenant_id from t) and module_key='controlled_copies';
select pg_temp.as_user('aaaa0000-0000-0000-0000-000000000002');
select assert_raises(
  $$select public.request_copy((select doc from wd), 'controlled','paper','x',1,'p')$$,
  'a pdf-only tenant refuses paper requests');
select assert_raises(
  $$select public.request_copy((select doc from wd), 'uncontrolled','pdf','x',1,'p')$$,
  'a tenant may forbid uncontrolled copies outright');
update public.tenant_modules set config = '{}'::jsonb
  where tenant_id=(select tenant_id from t) and module_key='controlled_copies';

-- ============ The story is on the chain, and the chain holds ============
select set_config('request.jwt.claims', null, true);
select assert(exists(select 1 from audit_trail where action='copy.requested'), 'requests are audited');
select assert(exists(select 1 from audit_trail where action='copy.request_declined'
    and reason like '%not permitted%'), 'declines carry their reason');
select assert(exists(select 1 from audit_trail where action='copy.request_issued'), 'issues are audited');
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact after the full walkthrough');
