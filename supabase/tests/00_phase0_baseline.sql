-- Phase 0 acceptance: baseline stood up (extensions + internal schema present,
-- and the internal schema is not exposed to client roles).
select assert(
  exists (select 1 from pg_extension where extname = 'pgcrypto'),
  'pgcrypto extension must be installed (needed for the audit hash chain)'
);

select assert(
  exists (select 1 from information_schema.schemata where schema_name = 'app'),
  'internal `app` schema must exist'
);

-- anon/authenticated must NOT have usage on the internal schema.
select assert(
  not has_schema_privilege('anon', 'app', 'usage'),
  'anon must not have usage on schema app'
);
select assert(
  not has_schema_privilege('authenticated', 'app', 'usage'),
  'authenticated must not have usage on schema app'
);
