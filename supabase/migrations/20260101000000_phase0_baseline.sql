-- ============================================================================
-- Phase 0 — Baseline
-- Extensions + internal schema. No domain logic yet. This is the known-good
-- floor every later migration builds on. Migrations are append-only and ordered
-- (Phase 0 guard): never edit a shipped migration, always add a new one.
-- ============================================================================

-- pgcrypto: digest() for the audit hash chain (Phase 1); gen_random_uuid() for ids.
create extension if not exists pgcrypto with schema extensions;

-- Internal schema for helper functions that must NOT be exposed as PostgREST RPCs.
-- Anything callable by clients lives in public; internal guts live here.
create schema if not exists app;

comment on schema app is
  'Internal helpers (tenant context, guards, audit primitive). Not exposed via the API.';

-- Lock down the internal schema: only privileged server roles touch it directly.
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to postgres, service_role;

-- Convention marker (documentation only): every tenant-scoped table created from
-- Phase 2 on MUST carry tenant_id (never null, never mutable) and an RLS policy.
-- Enforced by the Phase 7 isolation sweep, not by this comment.
