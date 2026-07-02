# QMS Manager — Platform Foundation

The GxP-compliant substrate every later module (document-control core included)
plugs into. Built strictly from `FOUNDATIONS.md` and `FOUNDATION_BUILD_PLAN.md`,
phase by phase. This repo is the **foundation only** — no document-control state
machine yet (that's the next plan).

## Stack

- **Next.js 15** (App Router, TypeScript) — the app + screens.
- **Supabase / Postgres** — data, RLS isolation, auth (Google SSO + MFA), RPCs.
- Migrations in `supabase/migrations/` — ordered, append-only. Never edit a shipped one.

## What's built (foundation phases)

| Phase | What | Migration |
|-------|------|-----------|
| 0 | Scaffold, env, migration tooling, CI, test harness | `..._phase0_baseline.sql` |
| 1 | Audit substrate — append-only, hash-chained, total | `..._phase1_audit.sql` |
| 2 | Tenancy & org model — RLS isolation from table one | `..._phase2_tenancy.sql` |
| 3 | Identity, invite & auth — Google SSO + MFA, invite-only | `..._phase3_identity.sql` |
| 4 | Org governance & roles — QA root, SoD primitive | `..._phase4_org_governance.sql` |
| 5 | Platform governance & break-glass gate | `..._phase5_platform_governance.sql` |
| 6 | Module switchboard & proving seam (swap-test) | `..._phase6_switchboard.sql` |
| 7 | Hardening & verification — sweeps, audit viewer | `..._phase7_verification.sql` |

## Document-control core (on top of the foundation)

Built from `DOCCONTROL_CONSOLIDATED_BUILD.md`, phase by phase. Migrations `..._dc_p1..p10_*`.

| Phase | What |
|-------|------|
| 1 | Version store & identity — system-id identity, one-effective DB constraint, atomic supersession |
| 2 | Read surface — effective-only, read-only, renderer seam (MS online), A.4 scoping |
| 3 | Library & Master Index (module) — dept working view, tenant-wide index, fallback when off |
| 4 | Numbering (module) — company number as metadata, going-forward uniqueness, legacy preserved |
| 5 | Unified intake — one door, inferred routing, dispute→QA, dispatch-lock |
| 6 | New SOP pipe — draft→endorse/QA→approve→{training\|scheduled\|active}, SoD, reject-preserves |
| 7 | Change pipe — impact hard gate, classification→signing matrix, concurrency, waiver, reconciliation, effectiveness review, atomic supersession |
| 8 | Retirement pipe — pre-checks, retention time-gate, destruction keeps metadata+audit |
| 9 | Coupling modules — training + controlled-copy register via seams (safe defaults, swap-test) |
| 10 | Periodic review, dashboards, audit oversight |

**Two laws (never violated):** identity is the system id, the human number is metadata (A.3);
configurable presentation, fixed enforcement (A.5) — no switch can weaken a guard. Guard
checklist (spec Appendix B) is enforced server-side and covered by `supabase/tests/2x_dc_*.sql`.

> Values the client QA ratifies (stored as data, not hardcoded): classification matrix,
> retention periods, training thresholds, effectiveness-review window, review cadence.

## Setup (one command)

1. Create a hosted Supabase project and a Google OAuth client.
2. `cp .env.example .env.local` and fill in **every** value (all credentials are yours to provide).
3. `npm install`
4. `npm run setup` — links the project, pushes all migrations, applies the seed.
5. `npm run db:test` — runs the SQL substrate tests against your DB.
6. `npm run dev` — start the app.

> **No Docker here?** The local Supabase stack (`supabase start`) needs Docker. This
> setup targets your **hosted** project instead, so no Docker is required locally.
> CI (`.github/workflows/ci.yml`) uses the local stack because runners have Docker.

## Testing

- **SQL substrate tests** — `supabase/tests/*.sql`, run by `npm test`
  (`scripts/run-sql-tests.mjs`; each file rolled back; `assert()` raises on failure).
  These are the executable acceptance criteria for the DB guards, SoD, RLS isolation,
  audit immutability and the workflow pipes — the real test suite.
- **Pre-deployment gate** — CI (`.github/workflows/ci.yml`) applies the migration
  chain from zero, runs the SQL suite, typechecks, and builds the app on every PR
  and on pushes to main.

## Training module (first module on the seam)

Built from `TRAINING_MODULE_BUILD_PLAN.md`. Migration `..._training_module.sql`;
acceptance test `supabase/tests/33_training_module.sql` runs the plan's §12
walkthrough end to end. AI-assisted (slides + questions drafted by the AI
Gateway — Gemini by default, platform-configured at `/platform/ai-gateway`,
key via `GEMINI_API_KEY` env only), with the non-negotiable human gate: a
trainer reviews, edits and approves every AI draft before it can be assigned.
Version-specific packages, server-side grading, append-only attempts, branded
PDF certificates (verifiable by uid), threshold feeding seam B, and the
execution block for untrained users. Module off → the core's safe default.

## The standing law (cross-cutting rules — apply everywhere)

1. Nothing escapes the audit trail (every controlled action writes audit).
2. Tenancy on every controlled row (`tenant_id`, never null, never mutable; RLS enforces).
3. Guards are server-side (DB/RPC), never UI-only.
4. Configurable at the edges, fixed at the core (modules switch; guards never).
5. Invited, never self-signed-up.
6. Deactivate, never delete (attribution survives forever).
7. Every seam ships with a stub that passes the swap-test.
