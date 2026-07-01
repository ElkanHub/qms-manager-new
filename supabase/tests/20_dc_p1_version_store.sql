-- DC Phase 1 acceptance: system-id identity, one-effective, atomic supersession, history.

create temp table t on commit drop as
  select * from app.provision_tenant('Tenant A', 'Org A', gen_random_uuid());

-- Helper to move a fresh draft version to 'approved'.
create or replace function pg_temp.approve(p_ver uuid) returns void language plpgsql as $$
begin
  perform app.transition_version(p_ver, 'in_approval', gen_random_uuid());
  perform app.transition_version(p_ver, 'approved', gen_random_uuid());
end $$;

-- (1) Identity is a system id, independent of the human number (which may be null/dup).
create temp table d on commit drop as
  select 'a'::text lbl, * from app.create_document(
    (select tenant_id from t),(select org_id from t),(select qa_department_id from t),
    'Calibration SOP', null, gen_random_uuid(), gen_random_uuid());
-- Historical duplicates enter as LEGACY imports (P4's going-forward uniqueness
-- exempts them; a non-legacy duplicate is refused — proven in 24_dc_p4).
insert into d select 'dup1', * from app.import_legacy_document(
  (select tenant_id from t),(select org_id from t),(select qa_department_id from t),
  'Doc One', 'DUP-1', gen_random_uuid(), gen_random_uuid());
insert into d select 'dup2', * from app.import_legacy_document(
  (select tenant_id from t),(select org_id from t),(select qa_department_id from t),
  'Doc Two', 'DUP-1', gen_random_uuid(), gen_random_uuid());

select assert((select count(distinct document_id) from d) = 3, 'three distinct system ids minted');
select assert((select count(*) from documents where document_number='DUP-1') = 2,
  'duplicate human numbers survive on legacy imports (migration reality) with distinct identities');

-- Changing a human number leaves identity + version chain intact.
update documents set document_number = 'RENUMBERED' where id = (select document_id from d where lbl='a');
select assert((select count(*) from document_versions where document_id=(select document_id from d where lbl='a')) = 1,
  'renumbering does not touch the version chain');

-- Renaming a department breaks nothing either: references key on ids, and the
-- audit chain stays intact after both renames.
update departments set name = 'Quality Assurance (renamed)'
  where id = (select qa_department_id from t);
select assert((select count(*) from documents
    where department_id = (select qa_department_id from t)) = 3,
  'department rename breaks no document references');
select assert((select count(*) from document_versions
    where department_id = (select qa_department_id from t)) = 3,
  'department rename breaks no version references');
select assert((select ok from app.verify_audit_chain((select tenant_id from t)::text)),
  'audit chain verifies after renumber + department rename');

-- (2) Make version effective (rev 00) with a controlled effective date.
select pg_temp.approve((select version_id from d where lbl='a'));
select assert(app.make_effective((select version_id from d where lbl='a'), gen_random_uuid(), '2026-01-01') = 0,
  'first effective version is revision 00');
select assert((select status from documents where id=(select document_id from d where lbl='a')) = 'active',
  'document becomes active on first effective');

-- (3) Add revision, make it effective → atomic supersession; still exactly one effective.
do $$
declare v2 uuid;
begin
  v2 := app.add_revision((select document_id from d where lbl='a'), gen_random_uuid());
  perform pg_temp.approve(v2);
  perform assert(app.make_effective(v2, gen_random_uuid(), '2026-06-01') = 1, 'second effective is revision 01');
end $$;

select assert(
  (select count(*) from document_versions
   where document_id=(select document_id from d where lbl='a') and status='effective') = 1,
  'exactly one effective version after supersession (never two)');
select assert(
  (select count(*) from document_versions
   where document_id=(select document_id from d where lbl='a') and status='superseded') = 1,
  'the predecessor is superseded');

-- The one-effective invariant is DB-enforced: forcing a second effective row fails.
select assert_raises(
  $$update document_versions set status='effective'
    where document_id=(select document_id from d where lbl='a') and status='superseded'$$,
  'a second effective version is rejected by the DB constraint');

-- (4) History: which version was effective on a given date.
select assert(
  app.version_effective_on((select document_id from d where lbl='a'), '2026-03-01')
    = (select version_id from d where lbl='a'),
  'the original version was effective in March (before supersession)');
select assert(
  app.version_effective_on((select document_id from d where lbl='a'), '2026-08-01')
    = (select current_version_id from documents where id=(select document_id from d where lbl='a')),
  'the new version is effective now');

-- Every step audited on the tenant chain.
select assert(exists(select 1 from audit_trail where action='version.effective'
  and chain_key=(select tenant_id from t)::text), 'effective transitions are audited');
select assert(exists(select 1 from audit_trail where action='version.superseded'),
  'supersession is audited');

-- (5) Chokepoint: an org user has no direct write path to status columns —
-- select-only grants and no write RLS policy. Whether the attempt raises
-- (permission denied) or no-ops (RLS zero rows), nothing may change: the only
-- working write paths are the audited transition RPCs.
do $$
declare v_doc uuid;
begin
  select document_id into v_doc from d where lbl='a';
  perform set_config('request.jwt.claims',
    json_build_object('sub','99990000-0000-0000-0000-000000000001',
      'app_metadata', json_build_object('tenant_id',(select tenant_id from t)))::text, true);
  execute 'set local role authenticated';
  begin execute format('update documents set status=''retired'' where id=%L', v_doc);
  exception when others then null; end;
  begin execute format('update document_versions set status=''draft'' where document_id=%L', v_doc);
  exception when others then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', null, true);
end $$;
select assert((select status from documents where id=(select document_id from d where lbl='a')) = 'active',
  'direct UPDATE of documents.status by an org user changes nothing (chokepoint)');
select assert(not exists(select 1 from document_versions
    where document_id=(select document_id from d where lbl='a') and status='draft'),
  'direct UPDATE of document_versions.status by an org user changes nothing (chokepoint)');
