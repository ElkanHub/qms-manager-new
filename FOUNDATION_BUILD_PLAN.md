# Foundation Build Plan — phase by phase

> **What this is.** The build plan for the **foundation** of the platform: the substrate every later module (document control core included) stands on. It implements the decisions settled in `FOUNDATIONS.md`. It is written for an implementation agent to execute phase by phase.
>
> **Scope of this plan.** This builds the *foundation only* — audit substrate, tenancy, identity/auth, the two governance planes, and the module switchboard with one proving seam. It does **not** build the document-control state machine yet; that is the next plan, and it plugs into what this one creates. The point of doing the foundation first is that the document-control core (and everything after) then slots onto solid ground without retrofitting fundamentals.
>
> **How to execute.** Phases are ordered by dependency — do them in sequence. Each phase has: **Goal**, **Build**, **Guards/invariants**, **Screens**, **Acceptance criteria**, and **Definition of done**. Do not start a phase until the previous phase's Definition of done is met. The acceptance criteria are written so they can be turned into tests. A consolidated screen inventory (all foundation screens, grouped by plane) sits near the end of the plan.
>
> **Settled decisions this plan implements** (from `FOUNDATIONS.md` §7): audit is total/append-only/hash-chained from day one; tenancy is Platform→Tenant→Org→Department (single-site, no branch), RLS-isolated, no cross-tenant users; identity is Google SSO + mandatory MFA with trusted-device remembering, invite-only; two governance planes (platform vs org) kept strictly separate; QA is the org root and default department; modules are switchboard-controlled with safe defaults so the flow never breaks when a module is off; platform-admin access to tenant data is gated break-glass, **per-tenant configurable, defaulting to org-approved (consent-based)**.

---

## 0. Cross-cutting rules (apply to every phase)

These hold throughout. They are not a phase; they are the standing law of the codebase.

**0.1 Nothing escapes the audit trail.** Every controlled action — in any phase, in any module — writes an audit entry (see Phase 1). A code path that performs a controlled action without writing audit is a defect, not a style issue. There are no exceptions, including for platform admins.

**0.2 Tenancy on every controlled row.** Every table that holds tenant data carries `tenant_id` (and `org_id` / `department_id` where relevant), set at creation, never null, never mutable. RLS enforces isolation. No query may cross tenant boundaries except explicit platform-plane queries that are themselves access-controlled and audited.

**0.3 Guards are server-side.** Every invariant (segregation of duties, append-only audit, access gates, etc.) is enforced in the database/RPC layer, never only in the UI. The UI reflects guards for usability; the server enforces them for correctness. Assume the UI can be bypassed.

**0.4 Configurable at the edges, fixed at the core.** Module on/off and module config are switchable per tenant. Core guards (audit, SoD, tenant isolation, the access gate's existence, immutability) are never switchable by anyone.

**0.5 Invited, never self-signed-up.** No public registration path exists anywhere. Every account originates from an invitation bound to a tenant/org/department/role.

**0.6 Deactivate, never delete.** Users and any entity bearing audit/signature history are deactivated, never hard-deleted. Attribution survives forever.

**0.7 Build the swap-test as you go.** For any seam, a stub implementation must let the system run correctly with the real module absent. Write the stub alongside the seam, not later.

**0.8 Tech baseline.** Next.js + Supabase/Postgres (consistent with the existing stack). RLS for isolation. Server actions/RPCs for controlled transitions. The plan is stack-shaped accordingly but the principles bind regardless of framework specifics.

---

## Phase 0 — Project scaffold & environment

**Goal.** A clean, reproducible project skeleton with the database, auth provider, and CI in place — nothing domain-specific yet. This phase exists so every later phase has a known-good baseline.

**Build.**
- Initialize the Next.js project and the Supabase/Postgres project.
- Establish migration tooling (ordered, versioned migrations) — every schema change from here on is a migration, never a manual edit.
- Wire Google as the auth provider at the infrastructure level (OAuth app, redirect URIs) — not the app logic yet, just the provider connection.
- Set up environments (local, staging) and a CI pipeline that runs migrations and tests on every change.
- Establish the testing harness (unit + integration) so acceptance criteria in later phases are executable.

**Guards/invariants.**
- Migrations are append-only and ordered; no destructive migration without an explicit, reviewed reason.
- Secrets are never committed; environment configuration is externalized.

**Acceptance criteria.**
- A fresh checkout can stand up the full environment from migrations + seed in one documented command.
- CI runs green on an empty domain (harness works, no domain logic yet).

**Screens (Phase 0).** None. Scaffold and environment only.

**Definition of done.** A reproducible skeleton exists; any developer/agent can rebuild the environment deterministically; CI is live.

---

## Phase 1 — The audit substrate (build this first, below everything)

**Goal.** The append-only, hash-chained, total audit trail that every later phase writes to. It is built before tenancy and auth because those phases must already be auditable as they are created. The audit substrate is the floor of the building.

**Build.**
- `audit_trail` table (append-only) capturing, per entry: actor, action, server-timestamp, tenant/org/department context, entity type + id, old value, new value, reason (for discretionary actions), and metadata (session, request id, source screen/endpoint).
- **Append-only enforcement at the database privilege level**: no UPDATE/DELETE grants on the table for any role, including admins. Reinforce with a trigger that rejects modification attempts.
- **Hash chaining from day one**: each entry stores a hash of (its own content + the previous entry's hash), so any later alteration or deletion is detectable. Define the chaining scope (global, or per-tenant chain — recommend per-tenant chain so a tenant's audit integrity is independently verifiable).
- A single **audit-write primitive** that every controlled action must call. This is the only sanctioned way to write audit. Make it ergonomic so there is no temptation to bypass it.
- Server-generated timestamps only (never trust client time).

**Guards/invariants.**
- No code path other than the audit-write primitive writes to `audit_trail`.
- The table rejects UPDATE and DELETE for everyone, enforced in the database, not the app.
- Hash chain is verifiable: a verification routine can walk the chain and detect any break.

**Acceptance criteria.**
- Attempting to UPDATE or DELETE an audit row fails at the database level, even as a superuser-equivalent app role.
- Inserting entries then tampering with one (simulated) makes the chain-verification routine report a break at exactly that point.
- The audit-write primitive captures every required field; an entry missing actor/action/timestamp/context cannot be written.
- A controlled action performed anywhere produces exactly one corresponding audit entry with correct old/new values.

**Screens (Phase 1).** None yet. The audit substrate is a below-the-surface layer; its *viewer* (S-AUDIT) and integrity panel (S-VERIFY) are built in Phase 7 once there is audited activity to display. The substrate itself is exercised through tests in this phase.

**Definition of done.** A total, immutable, tamper-evident audit trail exists and is the sole audit path. Everything built after this writes to it. Verification routine proves integrity.

---

## Phase 2 — Tenancy & organization model

**Goal.** The Platform → Tenant → Organization → Department hierarchy, with hard RLS isolation, built into the schema from the first domain table. Single-site (no branch level), but shaped so a branch could be inserted later.

**Build.**
- Core hierarchy tables: `tenants`, `organizations` (1:1 with tenant today but modelled as a separate level), `departments`. QA exists as the **default department** created automatically when an org is provisioned.
- `tenant_id` / `org_id` / `department_id` columns on every controlled table going forward (establish the convention and the helper that enforces it).
- **Row-level security** policies keyed on tenant, applied to every tenant-scoped table. Default-deny: a row is invisible unless the requester's tenant matches.
- Tenant context resolution: a reliable, server-side way to know "which tenant is this request acting in," used by RLS and by the audit-write primitive.
- Seed/provisioning routine for a tenant that atomically creates tenant + org + the default QA department, all audited.

**Guards/invariants.**
- No tenant-scoped row can be created without a tenant context; `tenant_id` is never null.
- RLS is default-deny; cross-tenant reads/writes are impossible through normal data paths.
- Tenant context is server-derived, never client-asserted.
- The hierarchy shape allows inserting a `branch` level between org and department later without rewriting existing rows (e.g. department references org now; a nullable branch reference can be added without breaking).

**Acceptance criteria.**
- A user in tenant A issuing any query sees zero rows of tenant B, verified across every tenant-scoped table.
- Creating a tenant produces tenant + org + default QA department in one atomic, audited operation.
- Attempting to insert a controlled row with a null/foreign tenant_id fails.
- Every table created in this phase has an RLS policy; a test enumerates tables and asserts none is unprotected.

**Screens (Phase 2).** None user-facing. This phase is schema, RLS, and the provisioning routine — all exercised through Phase 5's provisioning screen and verified by tests. No standalone UI is built here.

**Definition of done.** Multi-tenant isolation is real and enforced at the database level; the org hierarchy exists with QA as default department; provisioning a tenant is atomic and audited.

---

## Phase 3 — Identity, invitation & auth

**Goal.** Invite-only identity with Google SSO and mandatory, non-annoying MFA. No self-signup anywhere. Accounts are born bound to tenant/org/department/role.

**Build.**
- `users` table with identity bound to a Google account, plus `active`/`deactivated` status (never deleted).
- `invitations` table: one-time, expiring invites tied to an email + intended tenant/org/department/role/scope. An invitation is the only way an account comes into being.
- Invitation acceptance flow: invitee authenticates with Google; on first acceptance the account is created **already bound** to the invite's tenant/org/department/role.
- **Google SSO** as the authentication mechanism.
- **Mandatory MFA** enforced for every user, with **trusted-device remembering** so returning users on known devices aren't re-challenged every login (re-challenge on new device/location or after a configurable interval — default interval set here, tunable later).
- **No public registration route exists** — verify there is literally no code path to create an account except via invitation.
- Deactivation flow: a deactivated user cannot authenticate or act, but all their past audit entries and (later) signatures remain attributed to them.
- All of invite / accept / role-grant / deactivate are audited.

**Guards/invariants.**
- Account creation is impossible except through a valid, unexpired invitation.
- Every user belongs to exactly one tenant (no cross-tenant accounts).
- MFA cannot be disabled by the user; it can only be satisfied (with device remembering reducing friction).
- Deactivation preserves attribution; no hard delete of users.

**Acceptance criteria.**
- There is no reachable endpoint or UI that creates an account without an invitation (proven by inspection + test).
- An expired or reused invitation cannot create an account.
- A new account is created bound to exactly the invite's tenant/org/department/role — never unbound.
- A user without MFA satisfied cannot reach controlled actions; a returning user on a remembered device signs in without a fresh MFA prompt within the configured window.
- A deactivated user cannot authenticate; their historical audit entries still resolve to their identity.

**Screens (Phase 3).**
- **S-SIGNIN — Sign-in.** Google SSO sign-in. No password fields, no "create account" / "sign up" link anywhere (invite-only). The absence of a signup path is itself a requirement this screen embodies.
- **S-MFA — MFA challenge.** The mandatory second-factor step, with a "remember this device" option so returning users on known devices aren't re-challenged within the configured window. Designed to be low-friction.
- **S-INVITE-ACCEPT — Invitation acceptance.** The landing an invitee reaches from their one-time invite link: authenticate with Google, and the account is created already bound to the invite's tenant/org/department/role. Expired/used invites show a clear dead-end, not a signup fallback.
- **S-ACCOUNT — Account/profile (minimal).** A user's own basic account view; MFA/device management. No self-service role changes (roles are granted by QA).

> These are auth-flow screens shared by every plane; the *authorization* (what you see after signing in) is determined by role/plane from Phases 4–5.

**Definition of done.** Invite-only Google+MFA auth works end to end; accounts are tenant-bound at birth; deactivation preserves attribution; no self-signup exists.

---

## Phase 4 — Organization governance & roles (QA as root)

**Goal.** The org-plane role system, with QA as the root authority that provisions everything else inside the tenant. Roles are distinct, scoped, and enforce segregation-of-duties primitives that later phases (document control) will rely on.

**Build.**
- Org role definitions: Author, HOD, QA/Approver, Signatory, Trainer, Org-Admin (delegable), Viewer. Stored as data, assignable by QA.
- **The initial QA** is the only org user invited from outside (by the platform, Phase 5). From QA, all other users and roles are provisioned inside the org.
- Role-grant rules: QA can delegate **user-provisioning** to an Org-Admin capability, but **granting quality-critical roles (QA, Approver, Signatory) stays with QA** — enforced server-side.
- Department management: QA creates departments; HODs are assigned to departments by QA.
- **Segregation-of-duties primitive**: a reusable, action-level check ("is this actor distinct from the record's author/requester for this action?") that document control will consume later. Build it here as a shared guard, not inside any one workflow.
- Role scoping: roles resolve within the org hierarchy (HOD *of a department*; QA org-wide given single-site).
- All role grants, delegations, department changes audited.

**Guards/invariants.**
- Quality-critical role grants are QA-only; an Org-Admin cannot grant QA/Approver/Signatory.
- The SoD primitive is action-level (compares actor identity to the specific record's author/requester), not merely role-presence.
- A user may hold multiple roles but can never satisfy both sides of an SoD check on the same record.

**Acceptance criteria.**
- An Org-Admin attempting to grant a quality-critical role is refused server-side.
- QA can create a department, invite a user, and assign a HOD to that department, all audited.
- The SoD primitive, given an actor who is the author of a record, refuses an approval action by that actor — independently of which workflow calls it.
- Roles are scoped: a HOD of department X has no endorsement authority in department Y.

**Screens (Phase 4).**
- **S-ORG-HOME — Org admin/QA home.** The org-plane landing surface for QA (and org-admin): entry points to user management, department management, role assignment. The org's control center. Distinct from the platform board.
- **S-DEPARTMENTS — Department management.** QA creates/edits departments (QA exists as default) and assigns HODs to departments. Audited.
- **S-USERS — User & role management.** Invite users, assign roles, deactivate users. Enforces the delegation boundary in the UI (org-admin cannot grant quality-critical roles; those controls are QA-only). Real enforcement is server-side; the screen reflects it.
- **S-INVITE — Send invitation.** The invite composer: email + intended tenant/org/department/role/scope. Used by QA/org-admin for org users. Audited.

**Definition of done.** The org governance plane works: QA is the root, roles are distinct and scoped, delegation respects the quality-role boundary, and the SoD primitive exists for later phases to use.

---

## Phase 5 — Platform governance & the access gate

**Goal.** The platform plane, kept strictly separate from the org plane: tenant provisioning, owner-scoped invited platform admins, and the gated, logged, **per-tenant-configurable (default org-approved)** break-glass access to tenant data.

**Build.**
- Platform-plane roles: **Platform Owner** (root) and **Platform Admin** (invited by owner, individually scoped). Scope controls what each admin can see/do — granular, not all-or-nothing.
- Tenant provisioning (owner/authorized admin): creates a tenant and invites that tenant's **initial QA** (the seed that bootstraps the org plane). Audited.
- **Strict plane separation**: platform roles have zero org-workflow authority (never approve/sign/participate in quality flows); org roles have zero platform authority (can't provision tenants, can't flip the switchboard).
- **The break-glass access gate** to tenant document/audit data:
  - Default state: platform admins have **no** visibility into tenant controlled documents or org-level audit.
  - To view, an admin passes through an explicit **request-access gate** for a bounded session/purpose.
  - **Per-tenant configuration** of the gate's mode, defaulting to **org-approved (consent-based)**: the tenant's QA must grant the request before the gate opens. A tenant may instead choose **self-authorized + logged** (notification-based) if they prefer faster support.
  - Whichever mode: the access request, the grant/denial, the open session, and **everything the admin does during it** are all audited, and the **org sees every access event in its own audit trail**.
  - Access is time/purpose-bounded, not a standing permission.
- Module switchboard substrate (the table + platform-side controls) — the per-tenant module registry that Phase 6 will exercise. (Switchboard *mechanics* here; the proving seam in Phase 6.)

**Guards/invariants.**
- Platform plane and org plane are separate role systems; neither leaks into the other.
- No platform admin sees tenant document/audit data except through the gate, in the tenant's configured mode, fully audited.
- Org-approved mode genuinely blocks access until QA grants; self-authorized mode opens but logs and notifies.
- Even with the gate open, platform admins **view only** — they never act in a quality workflow.

**Acceptance criteria.**
- A platform admin, by default, sees no tenant document content or org audit.
- In org-approved mode, an access request stays closed until the tenant's QA grants it; the grant and the subsequent session are audited and visible to the org.
- In self-authorized mode, the admin opens the gate, and the org sees the access event in its audit immediately.
- Every action taken during an open access session appears in the org's audit trail.
- An org role cannot reach any platform-plane control (tenant provisioning, switchboard); a platform role cannot approve/sign in any org workflow.
- The gate mode is settable per tenant and defaults to org-approved.

**Screens (Phase 5).**
- **S-PLATFORM-HOME — Platform admin board (home).** The platform operator's landing surface: tenant list, system health, entry points to provisioning and the switchboard. Visible only to platform-plane roles.
- **S-TENANT-PROVISION — Tenant provisioning.** Create a new tenant → org → default QA department, and invite the initial QA. Audited. Owner or scoped admin only.
- **S-PLATFORM-ADMINS — Platform admin management.** Owner-only: invite platform admins and set each one's granular scope (what they can see/do). Mirrors the org's role-granting, at the platform plane.
- **S-ACCESS-GATE — Break-glass access request/console.** Where a platform admin requests access to a tenant's data for a bounded session/purpose. Shows the tenant's configured mode (org-approved default vs self-authorized). In consent mode, the request waits for QA; in self-authorized mode, it opens and notifies. Everything the admin does during an open session is captured.
- **S-ACCESS-GRANT — Access-grant screen (org-side, QA).** In consent mode, the QA screen to approve/deny a platform admin's access request, with reason. The org's control point over break-glass.
- **S-GATE-CONFIG — Gate mode setting** (per tenant). Where the gate mode (org-approved vs self-authorized) is set for a tenant; default org-approved.

> Note: the org's *view* of platform-admin access events lives inside **S-AUDIT** (Phase 7) — the org sees every access in its own audit trail there, not a separate screen.

**Definition of done.** Both governance planes exist and are sealed from each other; tenant provisioning seeds the org via the initial QA; the break-glass gate works in both modes, defaults to consent-based, and is fully audited and org-visible.

---

## Phase 6 — The module switchboard & the proving seam

**Goal.** Prove the modularity architecture works end to end by building the switchboard plus **one real coupling seam with a stub**, and demonstrating the swap-test: the system runs correctly whether the module is on, off, or absent. This phase is what guarantees the document-control core (next plan) can plug in cleanly.

**Build.**
- **Module registry & switchboard**: per-tenant on/off state for each module, plus per-tenant module config (thresholds, retention values, etc.). Lives on the platform admin board (platform-controlled), with **read-only visibility for the org** plus a "request a change" path back to the platform.
- **The seam contract**, formalized as two interface shapes:
  - **Trigger seam (inbound)**: a defined entry point a module calls to start something in the core. (Built as an interface now; no trigger modules attached yet — manual intake covers it, per the settled decision.)
  - **Coupling seam (bidirectional)**: the core reaches a decision point, asks a connected module, and waits for an answer; if the module is off/absent it uses a **defined safe default** that keeps the flow moving.
- **One concrete proving seam** to validate the whole pattern. Recommend implementing the **training coupling seam** abstractly here (the core asks "is training required / threshold met?"), with:
  - A **stub** that answers the default ("no training required") when the module is off/absent.
  - A **minimal real implementation or mock** that answers affirmatively when on.
  - (The seam is the deliverable; the full training module is a later plan. What matters now is that the seam + default + swap-test work.)
- **In-flight switch behaviour**: turning a module off applies only to flows that start after the switch; flows already engaged with the module continue under the old setting until they close.
- Switchboard changes (on/off, config, in-flight policy) all audited.

**Guards/invariants.**
- Every coupling seam has a defined safe default; with the module off/absent the core **always has a way forward** (the flow never breaks).
- A module off **removes a capability, never a step's ability to complete**.
- Core guards are never switchable via the switchboard (only modules and module config are).
- A module that does not write to the audit substrate is not connectable.

**Acceptance criteria (the swap-test is the headline).**
- **Swap-test:** with the proving-seam module replaced by the stub (off/absent), a representative flow that touches the seam completes correctly using the default. With the module on, the same flow correctly defers to the module's answer. No code change between the two — only the switch.
- Turning the module off mid-flight leaves an already-engaged flow running under the old setting; a new flow started after the switch uses the new setting.
- The org sees its module states read-only and can file a change request; it cannot flip the switch.
- An attempt to expose a core guard as a switchboard toggle is impossible by construction (guards aren't in the registry).
- Every switchboard action is audited.

**Screens (Phase 6).**
- **S-SWITCHBOARD — Module switchboard** (platform admin board). Per-tenant grid of modules with on/off toggles and per-module config (thresholds, retention values). Platform-controlled. Shows in-flight-switch policy. Every change audited. This is where a platform admin turns modules on/off for a tenant.
- **S-MODULES-ORG — Org module view** (org-side, read-only). The org sees which modules are enabled for them, read-only, with a **"request a change"** action that files a request back to the platform. They see the switchboard state but cannot flip it.

**Definition of done.** The switchboard works; the seam contract is real; the swap-test passes; the flow provably never breaks whether a module is on, off, or absent. The architecture is proven ready for the document-control core to plug into.

---

## Phase 7 — Foundation hardening & verification

**Goal.** Before declaring the foundation done, verify the whole substrate holds together under the cross-cutting rules — not as isolated phases but as one system. This is the "fit for GxP substrate" gate.

**Build / verify.**
- **End-to-end audit completeness sweep**: enumerate every controlled action across phases 1–6 and assert each produces a correct audit entry. Any unaudited controlled action is a defect to fix here.
- **Isolation sweep**: automated test that no tenant-scoped table is missing RLS and no cross-tenant access is possible by any path.
- **Plane-separation sweep**: assert no org role can reach platform controls and no platform role can act in org workflows (except the audited view-only gate).
- **Immutability sweep**: confirm audit append-only and hash-chain verification across realistic data volumes.
- **Auth sweep**: confirm no self-signup path, invite-only birth, MFA enforcement, deactivation-preserves-attribution.
- **Swap-test sweep**: confirm every seam built has a working default and passes the swap-test.
- **Audit viewer**: the read-only, sortable/filterable audit display (scoped per the viewing rules) — org QA sees their org; platform admins only via the gate. Exportable for inspection.
- Documentation: a short "foundation invariants" reference the document-control plan can cite, listing the guards and seams it can rely on.

**Acceptance criteria.**
- All sweeps pass.
- The audit viewer displays, sorts, and filters entries within the correct viewing scope, and exports read-only.
- A written list of the foundation's guarantees (guards, seams, defaults) exists for the next plan to build against.

**Screens (Phase 7).**
- **S-AUDIT — Audit trail viewer.** The read-only, sortable, filterable audit display. Filters by who, what, when, entity type/id, action type, and (platform scope) tenant. Scoped by viewing rules: **org QA sees only their org's trail**; **platform admins reach a tenant's trail only through the break-glass gate**. Read-only export for inspectors. This is the screen you open in front of an auditor — it must be clean, fast, and obviously complete.
- **S-VERIFY — Integrity check panel** (platform/admin oversight). Runs and displays the hash-chain verification result, showing the chain is unbroken (or pinpointing a break). Lightweight — a status view, not a workflow.

**Definition of done.** The foundation is internally consistent, every cross-cutting rule is verified by test, the audit trail is viewable within scope, and the next plan (document-control core) has a documented, stable substrate to plug into.

---

## Consolidated screen inventory (foundation)

All foundation screens in one place, grouped by governance plane. The foundation is substrate-heavy, so this is a small set; the document-control plan adds the large workflow surfaces (intake, review, signing, repository, etc.) on top.

**Shared auth flow (all planes)**
- **S-SIGNIN** — Google SSO sign-in; no signup path exists.
- **S-MFA** — Mandatory MFA challenge with trusted-device remembering.
- **S-INVITE-ACCEPT** — Invitation acceptance; account born tenant-bound.
- **S-ACCOUNT** — Minimal self account/device management.

**Platform plane (platform operator only)**
- **S-PLATFORM-HOME** — Platform admin board home (tenant list, health, entry points).
- **S-TENANT-PROVISION** — Provision a tenant + org + default QA; invite initial QA.
- **S-PLATFORM-ADMINS** — Owner invites/scopes platform admins.
- **S-SWITCHBOARD** — Per-tenant module on/off + config.
- **S-ACCESS-GATE** — Break-glass access request/console into a tenant.
- **S-GATE-CONFIG** — Per-tenant gate-mode setting (default org-approved).
- **S-VERIFY** — Audit hash-chain integrity panel.

**Org plane (org roles; QA is root)**
- **S-ORG-HOME** — Org/QA control center.
- **S-DEPARTMENTS** — Department management; assign HODs.
- **S-USERS** — User & role management (quality-role grants QA-only).
- **S-INVITE** — Send invitation to org users.
- **S-MODULES-ORG** — Read-only module view + request-a-change.
- **S-ACCESS-GRANT** — QA approves/denies platform break-glass (consent mode).

**Cross-plane, scoped by viewing rules**
- **S-AUDIT** — Audit trail viewer: org QA sees their org; platform admins via the gate; sortable, filterable, exportable. Also where the org sees every platform-admin access event.

> **Screen count:** ~19 foundation screens. Deliberately lean — the foundation is mostly enforced-substrate, and most user-facing richness arrives with the document-control workflows in the next plan. Each screen above reflects guards in the UI, but **enforcement is always server-side** (rule 0.3).

---

## Build order at a glance

```
Phase 0  Scaffold & environment
Phase 1  Audit substrate            ← built first, below everything
Phase 2  Tenancy & org model        ← isolation from the first domain table
Phase 3  Identity, invite & auth    ← Google SSO + MFA, invite-only
Phase 4  Org governance & roles     ← QA root, SoD primitive
Phase 5  Platform governance & gate ← planes sealed; break-glass (default consent)
Phase 6  Switchboard & proving seam ← modularity proven by swap-test
Phase 7  Hardening & verification   ← whole-substrate gate
                                     → ready for the Document-Control Core plan
```

## What this plan deliberately does NOT build (next plans)

- The document-control state machine (draft → effective → superseded → retained → destroyed), change control, classification, retirement — that is the **Document-Control Core** plan, which plugs into this foundation's seams and guards.
- Full modules (training/LMS, controlled-copy register, CAPA, deviation, periodic review) — each is its own later plan, connecting through the seam contract proven in Phase 6.

## Sequencing principle (why this order)

Each phase depends only on those before it. Audit is first because everything must be auditable as it's built. Tenancy precedes identity because accounts are born tenant-bound. Identity precedes governance because roles attach to accounts. Org governance precedes platform governance because platform provisioning *seeds* the org (the initial QA). The switchboard comes after both planes because it is platform-controlled and org-visible. Hardening is last because it verifies the assembled whole. Reordering breaks a dependency.

## A note on "robust but easy"

The robustness in this plan lives entirely in the substrate — audit, isolation, guards, the sealed planes. None of it should surface as friction to a well-behaved user. The ease comes later, in the workflow surfaces the document-control plan builds on top. Build the substrate uncompromisingly strict now, so the experience layer can be made genuinely simple later without ever weakening a guard to do it.

*End of foundation build plan.*
