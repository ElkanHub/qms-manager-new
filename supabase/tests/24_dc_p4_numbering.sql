-- DC Phase 4 acceptance: custom format, identity independence, going-forward uniqueness,
-- legacy duplicates preserved, module-off fallback.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

-- QA user (for set_numbering_format).
insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at)
  values ('0c000000-0000-0000-0000-0000000000cc','authenticated','authenticated','qa@a.test','{}',now(),now());
do $$ declare tok text; begin
  select token into tok from app.create_invitation('qa@a.test','org','qa',
    (select tenant_id from t),(select org_id from t),(select qa_department_id from t));
  perform public.accept_invitation(tok,'0c000000-0000-0000-0000-0000000000cc','qa@a.test');
end $$;

-- Enable numbering module and have QA define a custom format.
insert into public.tenant_modules(tenant_id, module_key, enabled) values ((select tenant_id from t),'numbering', true);
select set_config('request.jwt.claims', json_build_object('sub','0c000000-0000-0000-0000-0000000000cc',
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
set local role authenticated;
select public.set_numbering_format('{"prefix":"SOP","sep":"-","pad":3}'::jsonb);
reset role;

-- Numbers generate per the format; identity remains a separate system id.
select assert(app.next_document_number((select tenant_id from t)) = 'SOP-001', 'first number matches the format');
select assert(app.next_document_number((select tenant_id from t)) = 'SOP-002', 'sequence increments');

-- Going-forward uniqueness: two non-legacy docs cannot share a number.
insert into public.documents(tenant_id, org_id, title, document_number)
  values ((select tenant_id from t),(select org_id from t),'A','SOP-100');
select assert_raises(
  $$insert into public.documents(tenant_id, org_id, title, document_number)
    values ((select tenant_id from t),(select org_id from t),'B','SOP-100')$$,
  'going-forward duplicate numbers are rejected');

-- Legacy import preserves duplicates as historical fact (distinct system ids, intact chains).
select app.import_legacy_document((select tenant_id from t),(select org_id from t),
  (select qa_department_id from t),'Legacy One','LEG-9', gen_random_uuid(), gen_random_uuid());
select app.import_legacy_document((select tenant_id from t),(select org_id from t),
  (select qa_department_id from t),'Legacy Two','LEG-9', gen_random_uuid(), gen_random_uuid());
select assert((select count(*) from documents where document_number='LEG-9' and is_legacy) = 2,
  'legacy duplicates are preserved, not fixed');

-- Module OFF → system-default display number; identity unaffected.
update public.tenant_modules set enabled=false where tenant_id=(select tenant_id from t) and module_key='numbering';
do $$ declare doc uuid; num text; begin
  select document_id into doc from app.create_document((select tenant_id from t),(select org_id from t),
    (select qa_department_id from t),'Unnumbered', null, gen_random_uuid(), gen_random_uuid());
  num := app.apply_number(doc, gen_random_uuid());
  perform assert(num like 'DOC-%', 'with numbering off, a system-default display number is used');
  perform assert((select count(*) from documents where id=doc) = 1, 'identity is unaffected by numbering being off');
end $$;
select set_config('request.jwt.claims', null, true);
