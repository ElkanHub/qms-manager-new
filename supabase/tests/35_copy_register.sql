-- Controlled-copy register v2 acceptance: module gate on issue (never on
-- reconcile), effective-version-only distribution, unique copy numbers,
-- register accountability (issued_by/purpose/reconciled_by/note), method
-- vocabulary with documented "lost", recall surface on supersession, the
-- change-pipe outstanding-copies worklist, and the audit chain.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('99990000-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now()),
  ('99990000-0000-0000-0000-000000000002','authenticated','authenticated','u@a.test','{}',now(),now());
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('99990000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa'),
  ('99990000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'u@a.test','org','author');
insert into public.user_roles(user_id, tenant_id, role) values
  ('99990000-0000-0000-0000-000000000001',(select tenant_id from t),'qa');

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

-- ============ Module gate: OFF → no NEW copies ============
select pg_temp.as_user('99990000-0000-0000-0000-000000000001');
do $$ declare doc uuid; ver uuid; begin
  doc := pg_temp.mkeff('Gated Doc');
  select id into ver from document_versions where document_id=doc and status='effective';
  begin perform public.issue_controlled_copy(ver, 'shop floor'); raise exception 'expected module gate';
  exception when others then if sqlerrm not like '%module is off%' then raise; end if; end;
end $$;
insert into public.tenant_modules(tenant_id, module_key, enabled)
  values ((select tenant_id from t),'controlled_copies', true)
  on conflict (tenant_id, module_key) do update set enabled=true;

-- ============ Only the EFFECTIVE version is distributable ============
do $$ declare doc uuid; vd uuid; begin
  select document_id, version_id into doc, vd from app.create_document((select tenant_id from t),
    (select org_id from t),(select qa_department_id from t),'Draft Doc', null, gen_random_uuid(), gen_random_uuid());
  begin perform public.issue_controlled_copy(vd, 'anywhere'); raise exception 'expected effective-only';
  exception when others then if sqlerrm not like '%EFFECTIVE%' then raise; end if; end;
end $$;

-- ============ Issue: numbering, accountability, QA-only, holder required ============
create temp table cdoc on commit drop as select pg_temp.mkeff('Copy Doc') as doc;
do $$ declare ver uuid; c1 uuid; c2 uuid; begin
  select id into ver from document_versions where document_id=(select doc from cdoc) and status='effective';
  c1 := public.issue_controlled_copy(ver, 'Shop floor', 'production line reference');
  c2 := public.issue_controlled_copy(ver, 'Parts desk');
  perform assert((select copy_number from controlled_copies where id=c1) = 1
             and (select copy_number from controlled_copies where id=c2) = 2,
    'copy numbers run 1, 2 per version');
  perform assert((select issued_by from controlled_copies where id=c1) = '99990000-0000-0000-0000-000000000001',
    'the register records who issued');
  perform assert((select purpose from controlled_copies where id=c1) = 'production line reference',
    'the register records why');
  -- the DB itself refuses a duplicate number (not just the RPC)
  begin
    insert into controlled_copies(tenant_id, document_version_id, copy_number, holder)
      values ((select tenant_id from t), ver, 2, 'dup');
    raise exception 'expected unique violation';
  exception when unique_violation then null; end;
  begin perform public.issue_controlled_copy(ver, '   '); raise exception 'expected holder required';
  exception when others then if sqlerrm not like '%holder is required%' then raise; end if; end;
end $$;
select pg_temp.as_user('99990000-0000-0000-0000-000000000002');
select assert_raises(
  $$select public.issue_controlled_copy((select id from document_versions
      where document_id=(select doc from cdoc) and status='effective'), 'me')$$,
  'issuing is QA only');

-- ============ Reconcile: vocabulary, lost needs a note, accountability ============
select pg_temp.as_user('99990000-0000-0000-0000-000000000001');
do $$ declare c1 uuid; begin
  select id into c1 from controlled_copies where copy_number=1
    and document_version_id=(select id from document_versions
                             where document_id=(select doc from cdoc) and status='effective');
  begin perform public.reconcile_copy(c1, 'ate it'); raise exception 'expected method vocabulary';
  exception when others then if sqlerrm not like '%returned, destroyed or lost%' then raise; end if; end;
  begin perform public.reconcile_copy(c1, 'lost'); raise exception 'expected note requirement';
  exception when others then if sqlerrm not like '%documented%' then raise; end if; end;
  perform public.reconcile_copy(c1, 'lost', 'holder left site; copy unrecoverable — QA deviation DV-042');
  perform assert((select reconciled_by from controlled_copies where id=c1) = '99990000-0000-0000-0000-000000000001'
             and (select reconciled_note from controlled_copies where id=c1) like '%DV-042%',
    'the register records who reconciled and the documented note');
  begin perform public.reconcile_copy(c1, 'returned'); raise exception 'expected already-reconciled';
  exception when others then if sqlerrm not like '%already reconciled%' then raise; end if; end;
end $$;

-- ============ Recall surface: supersession puts issued copies on the worklist ============
do $$ declare v1 uuid; begin
  perform assert((select count(*) from copies_recall_due) = 0, 'nothing due for recall yet');
  v1 := app.add_revision((select doc from cdoc), gen_random_uuid());
  perform app.transition_version(v1,'in_approval', gen_random_uuid());
  perform app.transition_version(v1,'approved', gen_random_uuid());
  perform app.make_effective(v1, gen_random_uuid());   -- supersedes v0 atomically
  perform assert((select count(*) from copies_recall_due) = 1
             and (select holder from copies_recall_due limit 1) = 'Parts desk'
             and (select version_status from copies_recall_due limit 1) = 'superseded',
    'the outstanding copy of the superseded version is due for recall');
end $$;

-- ============ Module OFF again: reconciling stays possible (never orphan paper) ============
update public.tenant_modules set enabled=false
  where tenant_id=(select tenant_id from t) and module_key='controlled_copies';
do $$ declare c2 uuid; begin
  select id into c2 from copies_recall_due;
  perform public.reconcile_copy(c2, 'returned');
  perform assert((select count(*) from copies_recall_due) = 0, 'recall worklist clears on reconciliation');
end $$;
update public.tenant_modules set enabled=true
  where tenant_id=(select tenant_id from t) and module_key='controlled_copies';

-- ============ Change pipe: the gate now NAMES the outstanding copies ============
do $$ declare doc uuid; v0 uuid; v1 uuid; cc uuid; cid uuid; begin
  doc := pg_temp.mkeff('Pipe Doc');
  select id into v0 from document_versions where document_id=doc and status='effective';
  v1 := app.add_revision(doc, gen_random_uuid());
  perform app.transition_version(v1,'in_approval', gen_random_uuid());
  perform app.transition_version(v1,'approved', gen_random_uuid());
  insert into change_controls(id, tenant_id, org_id, department_id, type, status, classification, requester_id)
    values (gen_random_uuid(),(select tenant_id from t),(select org_id from t),(select qa_department_id from t),
            'CHANGE_SINGLE','pending_reconciliation','minor','99990000-0000-0000-0000-000000000002')
    returning id into cc;
  insert into change_control_documents(change_control_id, document_id, target_version_id, needs_training)
    values (cc, doc, v1, false);
  cid := public.issue_controlled_copy(v0, 'Contract site', 'external manufacture');
  perform assert((select count(*) from public.outstanding_copies_for_cc(cc)) = 1
             and (select holder from public.outstanding_copies_for_cc(cc)) = 'Contract site',
    'the reconciliation worklist names the copy and its holder');
  begin perform public.reconcile_cc(cc, null); raise exception 'expected outstanding block';
  exception when others then if sqlerrm not like '%outstanding%' then raise; end if; end;
  perform public.reconcile_copy(cid, 'destroyed');
  perform assert((select count(*) from public.outstanding_copies_for_cc(cc)) = 0, 'worklist empties');
  perform assert(public.reconcile_cc(cc, null) = 'effective', 'gate passes once the register is clean');
end $$;

select set_config('request.jwt.claims', null, true);

-- Every issue/reconcile above landed on the tenant chain — and it still verifies.
select assert(exists(select 1 from audit_trail where action='copy.issued'
    and chain_key=(select tenant_id from t)::text), 'issues are on the audit chain');
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact after the register runs');
