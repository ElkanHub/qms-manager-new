-- DC Phase 10 acceptance: next-review dates stored on effective (even if module off);
-- concluding "revise" raises a change; "no_change" bumps the date.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());
insert into auth.users(id, aud, role, email, raw_app_meta_data, created_at, updated_at) values
  ('66660000-0000-0000-0000-000000000001','authenticated','authenticated','qa@a.test','{}',now(),now());
insert into public.users(id, tenant_id, org_id, department_id, email, plane, initial_role) values
  ('66660000-0000-0000-0000-000000000001',(select tenant_id from t),(select org_id from t),(select qa_department_id from t),'qa@a.test','org','qa');
insert into public.user_roles(user_id, tenant_id, role) values ('66660000-0000-0000-0000-000000000001',(select tenant_id from t),'qa');

create temp table d on commit drop as
  select * from app.create_document((select tenant_id from t),(select org_id from t),(select qa_department_id from t),'Reviewed Doc', null, gen_random_uuid(), gen_random_uuid());
do $$ begin
  perform app.transition_version((select version_id from d),'in_approval', gen_random_uuid());
  perform app.transition_version((select version_id from d),'approved', gen_random_uuid());
  perform app.make_effective((select version_id from d), gen_random_uuid());
end $$;

-- next-review date is stored on effective, WITHOUT the periodic-review module being on
-- (core stores dates; the module only surfaces them).
select assert((select next_review_at from documents where id=(select document_id from d)) is not null,
  'the core stores a next-review date on effective, even with the module off');

select set_config('request.jwt.claims', json_build_object('sub','66660000-0000-0000-0000-000000000001',
  'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);

-- concluding "revise" raises a change control against the document
do $$ declare cc uuid; begin
  cc := public.conclude_periodic_review((select document_id from d),'revise','out of date');
  perform assert(cc is not null, 'a revise conclusion raises a change request');
  perform assert((select count(*) from change_control_documents where document_id=(select document_id from d) and change_control_id=cc)=1,
    'the raised change targets the reviewed document');
end $$;

-- concluding "no_change" pushes the next-review date into the future
do $$ declare doc uuid; before timestamptz;
begin
  doc := (select document_id from d);
  update documents set next_review_at = now() - interval '1 day' where id=doc;   -- make it overdue
  perform public.conclude_periodic_review(doc,'no_change','still current');
  perform assert((select next_review_at from documents where id=doc) > now(),
    'no_change pushes the next review into the future');
end $$;
select set_config('request.jwt.claims', null, true);
