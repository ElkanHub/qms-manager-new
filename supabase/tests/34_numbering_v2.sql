-- Numbering v2 acceptance: segment-based reorderable formats, department tag
-- from the originating (starter-request) department, per-department vs
-- company-wide counters, pipe wiring at dispatch, validation, module-off
-- fallback, department codes.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

-- QA (real invite so roles/context resolve) + a Production department + users.
insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('88880000-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now()),
  ('88880000-0000-0000-0000-000000000002','authenticated','authenticated','prod@a.test','{}',now(),now());
do $$ declare tok text; begin
  select token into tok from app.create_invitation('qa@a.test','org','qa',
    (select tenant_id from t),(select org_id from t),(select qa_department_id from t));
  perform public.accept_invitation(tok,'88880000-0000-0000-0000-000000000001','qa@a.test');
end $$;
insert into public.departments(id, tenant_id, org_id, name)
  values ('0d000000-0000-0000-0000-0000000000dd',(select tenant_id from t),(select org_id from t),'Production');
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role)
  values ('88880000-0000-0000-0000-000000000002',(select tenant_id from t),(select org_id from t),
          '0d000000-0000-0000-0000-0000000000dd','prod@a.test','org','author');

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p, 'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
$$;

insert into public.tenant_modules(tenant_id, module_key, enabled) values ((select tenant_id from t),'numbering', true);

-- Department codes: explicit for Production; the QA default department falls
-- back to its name-derived code.
select pg_temp.as_user('88880000-0000-0000-0000-000000000001');
select public.set_department_code('0d000000-0000-0000-0000-0000000000dd', 'PROD');
select assert(app.department_code('0d000000-0000-0000-0000-0000000000dd') = 'PROD', 'explicit code used');
select assert(app.department_code((select qa_department_id from t)) = 'QA', 'name-derived fallback code');

-- Non-admin cannot set codes.
select pg_temp.as_user('88880000-0000-0000-0000-000000000002');
select assert_raises(
  $$select public.set_department_code('0d000000-0000-0000-0000-0000000000dd', 'XX')$$,
  'department codes are QA/org-admin only');

-- ============ v2 format: SOP · department · number, per-department counters ============
select pg_temp.as_user('88880000-0000-0000-0000-000000000001');
select public.set_numbering_format(
  '{"segments":[{"type":"text","value":"SOP"},{"type":"department"},{"type":"sequence","pad":3}],
    "sep":"-","scope":"department"}'::jsonb);

-- Validation is real: two sequences / unknown type / bad scope all refused.
select assert_raises($$select public.set_numbering_format(
  '{"segments":[{"type":"sequence"},{"type":"sequence"}],"sep":"-"}'::jsonb)$$,
  'exactly one sequence segment enforced');
select assert_raises($$select public.set_numbering_format(
  '{"segments":[{"type":"emoji"},{"type":"sequence"}],"sep":"-"}'::jsonb)$$,
  'unknown segment types refused');
select assert_raises($$select public.set_numbering_format(
  '{"segments":[{"type":"sequence"}],"scope":"galaxy"}'::jsonb)$$,
  'scope must be tenant or department');

-- ============ The pipe: a starter request births a numbered document ============
do $$ declare iid uuid; d1 uuid; d2 uuid; d3 uuid;
begin
  -- Production employee raises two requests → PROD counter runs independently.
  perform pg_temp.as_user('88880000-0000-0000-0000-000000000002');
  select intake_id into iid from public.start_intake('new prod SOP','Granulation');
  d1 := public.dispatch_intake(iid);
  perform assert((select document_number from documents where id=d1) = 'SOP-PROD-001',
    'dispatch stamps the number with the ORIGINATING department tag');
  select intake_id into iid from public.start_intake('another prod SOP','Blending');
  d2 := public.dispatch_intake(iid);
  perform assert((select document_number from documents where id=d2) = 'SOP-PROD-002',
    'per-department counter increments');

  -- QA-department requester → its own counter starts at 001.
  perform pg_temp.as_user('88880000-0000-0000-0000-000000000001');
  select intake_id into iid from public.start_intake('qa SOP','Doc Control');
  d3 := public.dispatch_intake(iid);
  perform assert((select document_number from documents where id=d3) = 'SOP-QA-001',
    'departments run independent counters when scope=department');
end $$;

-- ============ Reorder the segments: department leads ============
do $$ declare iid uuid; d uuid;
begin
  perform pg_temp.as_user('88880000-0000-0000-0000-000000000001');
  perform public.set_numbering_format(
    '{"segments":[{"type":"department"},{"type":"text","value":"SOP"},{"type":"sequence","pad":3}],
      "sep":"-","scope":"department"}'::jsonb);
  perform pg_temp.as_user('88880000-0000-0000-0000-000000000002');
  select intake_id into d from public.start_intake('third prod SOP','Milling'); iid := d;
  d := public.dispatch_intake(iid);
  perform assert((select document_number from documents where id=d) = 'PROD-SOP-003',
    'segments reorder freely — department can lead');
end $$;

-- ============ Company-wide scope: one counter across departments ============
do $$ declare iid uuid; da uuid; db uuid;
begin
  perform pg_temp.as_user('88880000-0000-0000-0000-000000000001');
  perform public.set_numbering_format(
    '{"segments":[{"type":"text","value":"SOP"},{"type":"department"},{"type":"sequence","pad":3}],
      "sep":"/","scope":"tenant"}'::jsonb);
  select intake_id into iid from public.start_intake('tenant scoped','Shared A');
  da := public.dispatch_intake(iid);
  perform pg_temp.as_user('88880000-0000-0000-0000-000000000002');
  select intake_id into iid from public.start_intake('tenant scoped 2','Shared B');
  db := public.dispatch_intake(iid);
  perform assert(
    (select split_part(document_number,'/',3)::int from documents where id=db)
      = (select split_part(document_number,'/',3)::int from documents where id=da) + 1,
    'tenant scope: one company-wide counter across departments');
  perform assert((select document_number from documents where id=da) like 'SOP/QA/%',
    'custom separator applies');
end $$;

-- ============ Old P4 shape still renders identically (back-compat) ============
select pg_temp.as_user('88880000-0000-0000-0000-000000000001');
select public.set_numbering_format('{"prefix":"FRM","sep":"-","pad":4}'::jsonb);
do $$ declare n text; begin
  n := app.next_document_number((select tenant_id from t));
  perform assert(n like 'FRM-%' and length(split_part(n,'-',2)) = 4,
    'legacy prefix/sep/pad formats render unchanged');
end $$;

-- ============ Module OFF → dispatch still completes, system-default number ============
update public.tenant_modules set enabled=false where tenant_id=(select tenant_id from t) and module_key='numbering';
do $$ declare iid uuid; d uuid;
begin
  perform pg_temp.as_user('88880000-0000-0000-0000-000000000002');
  select intake_id into iid from public.start_intake('module off','Fallback Doc');
  d := public.dispatch_intake(iid);
  perform assert((select document_number from documents where id=d) like 'DOC-%',
    'numbering off → flow completes with the system-default display number (safe default)');
end $$;

-- ============ Retention setting (the modules page gains its editor) ============
select pg_temp.as_user('88880000-0000-0000-0000-000000000001');
select public.set_retention_period(60);
select assert((select months from retention_settings where tenant_id=(select tenant_id from t)) = 60,
  'QA sets the retention period');
select pg_temp.as_user('88880000-0000-0000-0000-000000000002');
select assert_raises($$select public.set_retention_period(12)$$, 'retention is QA-only');
select set_config('request.jwt.claims', null, true);

-- Numbering never touches identity: every stamped number sits over an
-- unchanged system id, and the audit chain still verifies.
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain intact after the numbering runs');
