-- Legacy library bulk import acceptance: QA/org-admin only, dry run writes
-- nothing and reports everything (bad rows, duplicate numbers preserved-not-
-- fixed), commit is all-or-nothing, imported documents are legacy + effective
-- rev 0, and the audit chain holds.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('77770000-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now()),
  ('77770000-0000-0000-0000-000000000002','authenticated','authenticated','owner@a.test','{}',now(),now());
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('77770000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa'),
  ('77770000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'owner@a.test','org','author');
insert into public.user_roles(user_id, tenant_id, role) values
  ('77770000-0000-0000-0000-000000000001',(select tenant_id from t),'qa');
insert into public.departments(id, tenant_id, org_id, name, code)
  values ('0e000000-0000-0000-0000-0000000000ee',(select tenant_id from t),(select org_id from t),'Production','PROD');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;

-- Non-admin refused.
select pg_temp.as_user('77770000-0000-0000-0000-000000000002');
select assert_raises(
  $$select public.import_legacy_library('[{"number":"X","title":"X","department":"PROD"}]'::jsonb)$$,
  'import is QA/org-admin only');

-- ============ Dry run: full report, zero writes ============
select pg_temp.as_user('77770000-0000-0000-0000-000000000001');
do $$ declare rep jsonb; before int;
begin
  select count(*) into before from documents;
  rep := public.import_legacy_library('[
    {"number":"SOP-001","title":"Granulation","department":"PROD","owner_email":"owner@a.test","effective_date":"2019-03-01"},
    {"number":"SOP-001","title":"Granulation (reissued)","department":"Production"},
    {"number":"SOP-002","title":"","department":"PROD"},
    {"number":"SOP-003","title":"Blending","department":"Warehouse"},
    {"number":"SOP-004","title":"Cleaning","department":"PROD","owner_email":"ghost@a.test"},
    {"number":"SOP-005","title":"Milling","department":"PROD","effective_date":"3000-01-01"},
    {"number":"SOP-006","title":"Weighing","department":"prod","effective_date":"not-a-date"}
  ]'::jsonb);
  perform assert((rep->>'dry_run')::boolean and (rep->>'total')::int = 7, 'dry run reports the batch');
  perform assert(jsonb_array_length(rep->'errors') = 5, 'five bad rows named (blank title, unknown dept, ghost owner, future date, bad date)');
  perform assert((rep->>'importable')::int = 2, 'the two clean rows are importable');
  perform assert(rep->'duplicate_numbers_in_file' ? 'SOP-001', 'in-file duplicate numbers are reported, not fixed');
  perform assert((select count(*) from documents) = before, 'dry run writes NOTHING');
end $$;

-- ============ Commit with a bad row: all-or-nothing ============
do $$ declare before int; begin
  select count(*) into before from documents;
  begin
    perform public.import_legacy_library('[
      {"number":"SOP-001","title":"Granulation","department":"PROD"},
      {"number":"SOP-002","title":"","department":"PROD"}
    ]'::jsonb, false);
    raise exception 'expected validation abort';
  exception when others then
    if sqlerrm not like '%failed validation%' then raise; end if;
  end;
  perform assert((select count(*) from documents) = before, 'a failed commit imports nothing');
end $$;

-- ============ Clean commit: legacy docs land whole ============
do $$ declare rep jsonb; begin
  rep := public.import_legacy_library('[
    {"number":"SOP-001","title":"Granulation","department":"PROD","owner_email":"owner@a.test","effective_date":"2019-03-01"},
    {"number":"SOP-001","title":"Granulation (reissued)","department":"Production","effective_date":"2021-06-01"},
    {"number":"SOP-010","title":"Weighing","department":"prod"}
  ]'::jsonb, false);
  perform assert((rep->>'imported')::int = 3, 'the batch lands whole');
  perform assert((select count(*) from documents where document_number='SOP-001') = 2,
    'historical duplicate numbers are PRESERVED on distinct system ids');
  perform assert((select bool_and(is_legacy and status='active') from documents
                  where document_number in ('SOP-001','SOP-010')),
    'imports are legacy + active');
  perform assert((select count(*) from document_versions dv join documents d on d.id=dv.document_id
                  where d.document_number='SOP-010' and dv.status='effective' and dv.revision_number=0) = 1,
    'each import carries its effective rev 0');
  perform assert((select owner_id from documents where document_number='SOP-001'
                  and title='Granulation') = '77770000-0000-0000-0000-000000000002',
    'owner resolves by email');
  perform assert((select effective_from::date from document_versions dv join documents d on d.id=dv.document_id
                  where d.title='Granulation' and d.document_number='SOP-001') = date '2019-03-01',
    'the historical effective date is kept');
end $$;

select assert(exists(select 1 from audit_trail where action='library.imported'
    and chain_key=(select tenant_id from t)::text), 'the batch lands one register event on the chain');
select set_config('request.jwt.claims', null, true);
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact after the import');
