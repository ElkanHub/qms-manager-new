-- DC capstone: after a full lifecycle spanning the pipes, the per-tenant audit hash
-- chain remains intact (tamper-evident, ALCOA+), and DC actions are captured.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A','Org A', gen_random_uuid());

do $$ declare doc uuid; ver uuid; v2 uuid; oldv uuid;
begin
  -- create → effective (rev00)
  select document_id, version_id into doc, ver from app.create_document((select tenant_id from t),
    (select org_id from t),(select qa_department_id from t),'Lifecycle SOP','SOP-1', gen_random_uuid(), gen_random_uuid());
  perform app.transition_version(ver,'in_approval', gen_random_uuid());
  perform app.transition_version(ver,'approved', gen_random_uuid());
  perform app.make_effective(ver, gen_random_uuid());
  -- revise → supersede (rev01), old version retained then destroyed
  v2 := app.add_revision(doc, gen_random_uuid());
  perform app.transition_version(v2,'in_approval', gen_random_uuid());
  perform app.transition_version(v2,'approved', gen_random_uuid());
  perform app.make_effective(v2, gen_random_uuid());
  perform public.start_retention_holds();
  select id into oldv from document_versions where document_id=doc and status='retained';
  update document_versions set retention_until = now() - interval '1 day' where id=oldv;
end $$;

-- audit trail captured the DC actions on the tenant chain
select assert(exists(select 1 from audit_trail where action='document.created' and chain_key=(select tenant_id from t)::text),
  'document creation captured');
select assert((select count(*) from audit_trail where action='version.effective' and chain_key=(select tenant_id from t)::text) = 2,
  'both effective transitions captured');
select assert(exists(select 1 from audit_trail where action='version.superseded'), 'supersession captured');
select assert(exists(select 1 from audit_trail where action='version.retained'), 'retention captured');

-- the hash chain still verifies end to end after all these writes
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'the tenant audit chain is intact after a full document lifecycle');
