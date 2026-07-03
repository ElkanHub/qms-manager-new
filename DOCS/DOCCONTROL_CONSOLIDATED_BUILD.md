# Document-Control Core — CONSOLIDATED Build Package (self-contained)

> **Why this file exists.** An agent reported that `DOCUMENT_CONTROL_SYSTEM_SPEC.md` (and other referenced files) were not in the repo, so the `spec §X` / `FOUNDATIONS §X` cross-references did not resolve. This single file fixes that by bundling everything the build plan points into, in one place. **Nothing here needs an external file.**
>
> **How the references work now.** The build plan (Part I below) uses pointers like `spec §7.2`, `spec §10.6`, `FOUNDATIONS §7`, and `A.4`.
> - `spec §N` → resolves to **Part II — Document Control System Specification** in this same file (its section N).
> - `FOUNDATIONS §N` and foundation decisions → resolve to **Part III — Foundations** in this same file.
> - `A.N` and phase-internal references → are within Part I (the build plan) itself.
>
> **Order to read/execute.** Read Part I (the build plan) as the executable spine. When a phase points to `spec §X`, look it up in Part II for the full detail (state tables, transitions, data model). Part III holds the settled platform decisions. The foundation build plan is a separate prerequisite file (`FOUNDATION_BUILD_PLAN.md`); this package assumes the foundation is already built.
>
> **Prerequisite still external:** `FOUNDATION_BUILD_PLAN.md` (the substrate: audit, tenancy, identity, governance, switchboard). That must be built first; it is not duplicated here to keep this file focused on the document-control core. If the agent also needs it inline, say so and it will be appended.

---

# PART I — DOCUMENT-CONTROL CORE BUILD PLAN

*(This is the executable plan. `spec §X` pointers resolve in Part II; `FOUNDATIONS`/decisions resolve in Part III, both in this same file.)*


> **What this is.** The phase-by-phase build plan for the **document-control core** — the state machine, the read surface, the SOP library, change control, classification, retirement — that plugs onto the foundation built in `FOUNDATION_BUILD_PLAN.md`. It implements the corrected flow from `DOCUMENT_CONTROL_SYSTEM_SPEC.md` and respects every decision in `FOUNDATIONS.md`.
>
> **Depends on.** The foundation must be complete first. This plan *consumes* the foundation's guarantees: the audit substrate (every action here writes to it), tenancy + RLS, identity/roles, the SoD primitive, the two governance planes, and the module switchboard + seam contract. This plan does not re-build any of those; it builds *on* them.
>
> **How to execute.** Same format as the foundation plan. Phases are dependency-ordered. Each phase: **Goal**, **Build**, **Guards/invariants**, **Screens**, **Configurability (scoped)**, **Acceptance criteria**, **Definition of done**. Do not start a phase until the prior phase's Definition of done is met.

---

## A. The core-vs-module split (read this first — it governs everything)

The single most important architectural decision in this plan, stated plainly so it is never violated:

**The read surface is CORE and never off. The library *experience* is a MODULE and is configurable.**

These were conflated as "the SOP library." They are two different things:

- **Read surface (CORE, intrinsic, never switchable).** The ability to retrieve and display *the current effective version* of a document, read-only. This is the consumption half of the entire QMS. If it were off, the system would be broken. It is a query-plus-rendering lens over the version store — not a separate copy, not a syncable feature. Core owns it.

- **SOP Library experience (MODULE, configurable, can be reconfigured/restyled, has a fallback if disabled).** How documents are browsed, categorized, searched, favorited; the Master Index UI; the department-scoped working view; per-tenant styling and organization. This is the shell around the read surface. If this module is disabled, the core read surface must remain reachable through a plain fallback view — the flow never breaks.

**Consequence to internalize:** you can restyle, reorganize, and reconfigure the library per company, but you can never configure away the ability to read an effective document. That capability lives in core, below the module.

### A.1 What is CORE (never pluggable, never configurable-to-weaken)

- The **version store** — system of record for every version in every state, keyed on **system-generated immutable ids** (see A.3).
- The **read surface** — effective-version-only, read-only rendition.
- The **state machine** — draft → … → effective → superseded → retained → destroyed, and all change-control / retirement states.
- All **guards** — SoD, atomic supersession, one-effective-version, retention time-gate, mandatory impact gate, classification-driven depth.
- Every action writing to the **audit substrate**.

### A.2 What is MODULE (configurable, switchable, per-tenant)

- **SOP Library experience** — browse, Master Index, categorization, styling, working-view organization.
- **Numbering** — per-tenant format definition, validation, application, display (see A.3).
- **Rendition/viewer choice** — which renderer serves the read surface (MS online default; internal PDF fallback as a future option).
- **Training, controlled-copy register, CAPA/deviation/findings, periodic review** — as previously specified, each via the seam contract.

### A.3 Document identity vs the human number (the data-integrity crux)

**Non-negotiable.** The system's internal document identity is its **own** — a stable, system-generated, immutable id the company never sees and never controls. The version chain, audit trail, supersession, and every internal reference key on **that id**, never on the human-facing number.

The company's SOP number (their format, e.g. `QMS-PROD-014`) is **metadata** — a displayed, searchable, human-facing label attached to the document. The Numbering module defines the format, validates/applies it to new documents, and displays/filters on it. It **never becomes the identity.**

- **Migration rule:** legacy numbers arrive as this metadata label attached to system-generated ids — **including duplicates and inconsistencies**, preserved as historical fact. You do **not** "fix" historical records (that is itself a data-integrity violation). You carry the mess forward faithfully and enforce the clean convention only for documents created *going forward*.
- **Why:** if the human number were the key, a legacy duplicate, a renumber, or a format change would break the version chain and audit references. Keying on a system id welds integrity to the system, not to the company's mess.

### A.4 Scoping model (settled)

- **Effective document *content* is readable tenant-wide.** Any user can open and read any effective SOP company-wide via the Master Index. This is a deliberate choice for cross-referencing. **Therefore department scoping is an *organizing* convention for effective documents, not a read-security boundary.**
- **In-flight work is scoped.** Drafts and documents in review are visible only to those party to them (author, department, assigned reviewers, QA).
- **Actions are scoped by role + department.** Who can endorse, approve, sign is bound by role and department, enforced by the foundation's SoD primitive.
- **Net:** effective *reading* is tenant-wide; *doing* and *in-flight visibility* are scoped. Do not build department-level read-security on effective documents — it does not exist by design.

### A.5 The configurability law (applies to every phase)

**Configurable presentation, fixed enforcement.** Every configurability decision is tested against one question: does this configure *presentation* or *enforcement*?
- **Presentation** (layout, styling, numbering format, categories, which modules are exposed, renderer choice, working-view organization) → configurable, per-tenant, on the switchboard.
- **Enforcement** (SoD, audit, atomic supersession, retention gate, effective-only read surface, mandatory impact gate) → **never** configurable. No switch may weaken a guard.

A system that can be *configured into non-compliance* is a defect. This law is how we prevent it.

---

## Phase 1 — Version store & document identity (the system of record)

**Goal.** The foundational data layer for controlled documents: the document/version model keyed on system-generated immutable ids, with the human number as metadata. Everything else in this plan hangs off this. No workflow yet — just the correct spine.

**Build.**
- `documents` table: system id (PK, immutable), `document_number` (human metadata label), title, department/org/tenant scoping, `status` (lifecycle pointer), `current_version_id`, owner. (Per spec §10.1.)
- `document_versions` table with its **own state set** (`draft`/`in_approval`/`approved`/`effective`/`superseded`/`retained`/`destroyed`), keyed on system id, referencing the document by system id. Revision number allocated at effective time (spec §7.10 recommendation). (Per spec §10.2.)
- The **one-effective-version invariant** enforced at the DB level (constraint or exclusion): a document can have at most one version in `effective`.
- The **atomic supersession primitive**: successor→effective + predecessor→superseded in a single transaction (spec §7.11).
- History retrievability: given any past date, resolve which version was effective then, from version rows + effective/superseded timestamps.
- Every create/transition writes to the foundation's audit substrate.

**Guards/invariants.**
- Internal identity is the system id; **no internal reference keys on the human number.**
- At most one effective version per document, ever (DB-enforced).
- Supersession is atomic — never two effective, never zero mid-transition.
- Version rows are never hard-deleted (retention/destruction is a state, not a delete).

**Screens.** None user-facing yet. This is the record layer, exercised by tests and by later phases.

**Configurability (scoped).** None here — this is core spine, non-configurable by definition.

**Acceptance criteria.**
- Creating a document generates a system id independent of any human number; the human number can be null, duplicated (migration), or later changed without affecting identity or references.
- Attempting to set two versions of one document to `effective` fails at the DB level.
- The supersession primitive, run under simulated mid-transaction failure, leaves exactly one effective version (never two, never zero).
- "Which version was effective on date X" resolves correctly from version history.

**Definition of done.** The version store exists, keyed on immutable system ids, with the human number as metadata; one-effective-version and atomic supersession are DB-enforced; history is retrievable; all audited.

---

## Phase 2 — The read surface & rendition (CORE, never off)

**Goal.** The intrinsic ability to read the current effective version of a document, read-only, rendered via the configurable viewer (MS online default). This is core consumption — built early because everything visible depends on it.

**Build.**
- The **read-surface query**: per document, retrieve the version whose status is `effective`, as a read-only rendition. This is the lens over the version store — no second copy.
- **Rendition handling**: on a version going effective, store/prepare the read-only rendition served to viewers (not the editable source — spec controlled-copy principle). The editable content lives in the workflow; the repository serves the locked rendition.
- **Viewer seam (configurable renderer)**: the renderer is a **coupling seam**, defaulting to **Microsoft online view** (client is M365). Word documents of all types accepted as the upload/source format. The seam is abstracted so an **internal-PDF renderer** can be swapped in per-tenant later without touching core. Default resolution if the configured renderer is unavailable: serve a safe internal rendition rather than fail (flow never breaks).
- **Read-access rule**: effective content is readable tenant-wide (A.4). Enforce that the read surface serves any effective document to any tenant user, while in-flight versions are *not* served here.
- Read events optionally audited (per-tenant read-tracking setting from foundation).

**Guards/invariants.**
- The read surface serves **only** effective versions, **read-only** — never the editable source, never an in-flight version.
- Renderer is swappable (seam), but the *existence* of a read surface is core and never off.
- Effective content tenant-wide readable; in-flight excluded from this surface.

**Screens.**
- **D-READ — Document read view.** Opens the current effective version, read-only, in the configured viewer (MS online). Shows the human number, title, revision, effective date, and a link to history. This is the core consumption screen; the Library module (Phase 3) wraps browsing around it, but this view is reachable even if the Library module is off (fallback).
- **D-HISTORY — Version history.** Read-only list of a document's versions with states, effective/superseded dates, and who approved. Answers "which version was effective when." Superseded/retained versions viewable here for reference.

**Configurability (scoped).**
- **Renderer choice** (per-tenant): MS online (default) vs internal PDF (future). Presentation-level — allowed.
- **Read-tracking** (per-tenant): on/off, from foundation. Allowed.
- **Not configurable:** that the surface shows only effective, read-only; that a read surface exists at all.

**Acceptance criteria.**
- Opening a document serves exactly the effective version, read-only, in the MS online viewer; the editable source is never exposed here.
- With the Library module disabled, D-READ is still reachable (fallback) — reading never breaks.
- An in-flight (draft/in-review) version is never served by the read surface.
- Swapping the renderer seam to a stub/alternate serves the document without a core code change (swap-test).
- Any tenant user can read any effective document (A.4); a user from another tenant cannot.

**Definition of done.** Effective documents are readable, read-only, via the configurable MS-online renderer; the read surface is core and survives the Library module being off; in-flight content is never exposed; history is viewable.

---

## Phase 3 — SOP Library module & Master Index (configurable experience)

**Goal.** The browsing experience over the core read surface: the department-scoped working view, the tenant-wide Master Index, categorization, search, and per-tenant styling. This is a **module** — configurable, restyleable, and if off, the core read surface (Phase 2) still serves documents.

**Build.**
- **Library module** registered on the switchboard (per-tenant on/off + config), consuming the Phase 2 read surface — it never reaches into the version store directly.
- **Department-scoped working view**: a user's default library view, filtered to their department's effective SOPs. This is an *organizing convenience*, not read-security (A.4).
- **Master Index**: a **"Master Index" button** opening a **tenant-wide, unscoped** list of all effective SOPs, ordered and **filterable** (by number, title, department, effective date, category). From here a user can **open and read any effective SOP company-wide** (A.4) — cross-department reference is the whole point.
- **Search & categorization**: per-tenant-configurable categories/taxonomy; search across number, title, metadata.
- **Per-tenant styling/organization**: the library shell adapts to the company's structure and branding (presentation-level).
- **Fallback**: if the Library module is off, users reach documents via the core read surface (D-READ/D-HISTORY) directly — degraded browsing, but reading intact.

**Guards/invariants.**
- The Master Index shows effective documents tenant-wide (reference access); it lists only effective versions (not in-flight).
- The Library module reads through the core read surface only; it holds no authoritative document data.
- Disabling the module never disables reading (fallback to core surface).
- Scoping here is organizational, not a read-security boundary for effective docs (A.4).

**Screens.**
- **D-LIBRARY — SOP Library (working view).** The department-scoped default browse experience; per-tenant styled. Search, categories, favorites. Wraps D-READ for opening documents.
- **D-MASTER-INDEX — Master Index.** The tenant-wide, unscoped, ordered, filterable list of all effective SOPs. Opened via the "Master Index" button. Any effective SOP openable for full read (A.4). The reference/info-gathering surface.
- (Opening any item routes to **D-READ** from Phase 2.)

**Configurability (scoped).**
- **On/off** (switchboard): the Library experience can be disabled; core read surface remains.
- **Categories/taxonomy, styling, working-view organization, favorites** (per-tenant): presentation-level — allowed.
- **Numbering display format** feeds in from the Numbering module (Phase 4).
- **Not configurable:** that the Master Index is tenant-wide reference-readable (A.4 is a settled model, not a per-tenant toggle unless we later decide otherwise); that only effective versions are listed; that reading survives the module being off.

**Acceptance criteria.**
- The Master Index button opens a tenant-wide list; a user opens and reads an effective SOP from another department (A.4).
- The working view defaults to the user's department but is clearly a filter, not a wall (they can reach anything via Master Index).
- Disabling the Library module leaves documents readable via the core surface.
- Re-styling/re-categorizing per tenant changes presentation only; no document data or state is affected.
- In-flight documents never appear in the library or master index.

**Definition of done.** The Library experience wraps the core read surface with a department working view and a tenant-wide, filterable Master Index enabling cross-department read; it is fully configurable/restyleable; disabling it never breaks reading.

---

## Phase 4 — Numbering module (format as metadata, never identity)

**Goal.** Let a transitioning company keep their own SOP numbering convention — defined, validated, applied, displayed — as **metadata over the system id**, never as identity. This is the part most likely to compromise integrity if built wrong (A.3).

**Build.**
- **Numbering module** on the switchboard (per-tenant on/off + config). If off, documents use a plain system-default display number; identity is unaffected either way.
- **Format definition (per-tenant, QA-owned)**: QA defines the company's number format/convention (segments, separators, sequence rules, department/type encoding) as configuration data — the module is version-controlled itself.
- **Validation & application**: for new documents, auto-generate or validate the next number against the convention. Enforce uniqueness *going forward* (not retroactively).
- **Display & filter**: the human number is shown everywhere a document appears and is a filter/search key in the Library and Master Index.
- **Migration handling**: legacy numbers import as metadata labels on system ids, **including duplicates/inconsistencies preserved as historical fact** (A.3). No retroactive "fixing." The clean convention applies only to documents created after cutover.

**Guards/invariants.**
- The human number is **metadata**; **no internal reference keys on it**. Changing/duplicating a number never affects identity, version chain, or audit references.
- Going-forward uniqueness enforced; historical duplicates preserved untouched.
- Format is per-tenant config (presentation); it never gates a core transition.

**Screens.**
- **D-NUMBERING-CONFIG — Numbering format setup** (QA / org-admin). Define the company's convention: segments, sequence, encoding. Preview generated numbers. Per-tenant.
- (Number display/filter surfaces inside D-LIBRARY, D-MASTER-INDEX, D-READ — not a separate screen.)

**Configurability (scoped).**
- **On/off** and **full format definition** (per-tenant): presentation-level — allowed.
- **Not configurable:** that the number is metadata, not identity; that historical records are preserved unfixed; that going-forward uniqueness holds.

**Acceptance criteria.**
- QA defines a custom format; new documents receive numbers matching it; identity remains a separate system id.
- A legacy import with duplicate numbers succeeds, preserving duplicates as historical fact, with distinct system ids and intact version chains.
- Changing a document's human number (allowed correction) leaves its version chain, audit trail, and supersession references intact.
- Disabling the Numbering module falls back to system-default display numbers with no identity impact.

**Definition of done.** Companies can define and use their own numbering as configurable metadata; identity stays on immutable system ids; migration preserves historical mess faithfully; going-forward convention is enforced; integrity is never welded to the human number.

---

## Phase 5 — Unified intake & routing (one door)

**Goal.** The single entry point that infers request type from context, confirms with the user, and routes into the correct pipe — the "easy" surface over the strict engine (spec §5).

**Build.**
- **Intake action**: captures optional target document(s), reason (mandatory), uploaded Word content, and infers type: `NEW_SOP` (no effective target), `CHANGE_SINGLE` (one effective target), `CHANGE_MULTI` (many), `RETIRE` (target + discontinue intent). Inference keys off an **effective** version existing, not any row (spec §5.2).
- **Confirm-with-rationale**: show the inference and *why* ("SOP-042 is effective, so this is a change"); user confirms, cannot freely relabel.
- **Dispute path**: user can dispute → routes to QA to re-evaluate; override logged (spec §5.4).
- **Abandoned-draft fork**: surface an existing unfinished draft; resume or start fresh, choice logged (spec §5.5).
- **Type locked at dispatch**, not capture (spec §5.6).
- All intake decisions audited.

**Guards/invariants.**
- Inference keys off effective-version existence.
- Type is confirmable/disputable but not freely relabelable; disputes are QA-arbitrated and logged.
- Type immutable after dispatch.

**Screens.**
- **D-INTAKE — Start a request.** One door. Capture target(s), reason, upload. Shows inferred type + rationale. Confirm / dispute. Surfaces the abandoned-draft fork. The primary "easy" surface — kept clean.

**Configurability (scoped).**
- **Not configurable:** the inference logic, the confirm/dispute gate, dispatch-lock — these are enforcement. (Presentation of the screen can be styled, but the routing behavior is fixed.)

**Acceptance criteria.**
- No effective target → routes NEW_SOP; one effective target → CHANGE_SINGLE; many → CHANGE_MULTI; discontinue intent → RETIRE.
- An abandoned draft is surfaced with resume/fresh choice, logged.
- A dispute routes to QA and the override is logged.
- Type cannot change after dispatch.

**Definition of done.** One intake door infers, confirms, and routes correctly; disputes are handled; the abandoned-draft fork works; everything audited.

---

## Phase 6 — New SOP pipe (creation → active)

**Goal.** The creation workflow: draft → HOD endorse (employees) / direct (managers) → QA review → approve → training/scheduling → active rev 00 (spec §6). Consumes the foundation SoD primitive.

**Build.**
- State transitions per spec §6.3, each with trigger/actor/guard.
- **HOD-is-submitter fallback** (spec §6.4): if the HOD authored it, endorsement routes to a peer HOD / deputy / QA; logged.
- **Training coupling seam** (spec §6.5): at the effective window, ask the training module (if on) whether training is required + threshold met; if off, default = no training → effective directly. **Untrained users blocked from execution** when training is on.
- **Scheduled state** for future effective dates (spec §6.6); date-driven activation.
- **Reject preserves draft + reason** (spec §6.7); never deletes.
- All transitions audited; SoD enforced (QA ≠ author/submitter).

**Guards/invariants.**
- Author ≠ approver; HOD ≠ submitter (fallback if so); QA ≠ author/submitter — all via foundation SoD primitive.
- Training seam has a safe default (no training) when the module is off.
- Scheduled documents are not live until their date.
- Reject retains history.

**Screens.**
- **D-DRAFT — Draft editor.** Upload/edit Word content, supply reason, attach any needed fields. Submit. Shows current state + next step.
- **D-CHANGES — Changes-requested response.** Author sees the request + reason; revises/resubmits; prior versions preserved.
- **D-ENDORSE — HOD endorsement queue.** Employee submissions awaiting this HOD. Endorse / request changes. **Endorse hidden/disabled when HOD = submitter**, surfacing the fallback route.
- **D-QA-REVIEW — QA review/approval.** Review content, request changes, reject (reason required), approve. Set training requirement, set effective date (today or scheduled). **Approve disabled when QA = author/submitter.**
- (Tasks surface via the foundation's **My tasks / inbox**.)

**Configurability (scoped).**
- **Training seam on/off + threshold** (per-tenant, via switchboard): allowed — but the *block-untrained-from-execution* guard when training is on is not configurable.
- **Not configurable:** SoD, reject-preserves-history, scheduled-not-live-until-date.

**Acceptance criteria.**
- Employee submission requires HOD endorsement; manager submission skips to QA.
- HOD-authored document routes endorsement to the fallback, logged.
- With training module off, a new SOP goes effective without a training gate; with it on, untrained users are blocked from execution.
- A future effective date holds the document in `scheduled` until the date arrives.
- Reject returns to draft with the reason retained.
- QA cannot approve a document they authored/submitted.

**Definition of done.** New SOPs flow from draft to active rev 00 with all SoD guards, the HOD fallback, the training seam (with safe default), scheduling, and history-preserving reject — all audited.

---

## Phase 7 — Change pipe (request → change control → effective)

**Goal.** The densest workflow: both change fronts, mandatory impact gate, risk classification driving depth, concurrency guard, signing matrix, reconciliation, training, effective, effectiveness review, closure (spec §7).

**Build.**
- **Mandatory impact assessment** as a **hard gate** (spec §7.2): `impact_pending` cannot advance until required fields complete — no "submit anyway," enforced server-side.
- **Risk classification** minor/major/critical from the **data-driven classification matrix** (spec §7.3, §10.10); QA-confirmable/overridable with logged reason.
- **Concurrency / lock-conflict guard** (spec §7.4): if an affected document is locked under another open change, new change enters `queued` until unlock.
- **Lock + revision bump** at `create_change_control` (document → `locked_in_cc`).
- **Classification-driven signing matrix** (spec §7.7): required signatory set determined by class; completion check passes only when all signed/waived.
- **Waiver** (spec §7.8): admin-only, reason-required, logged, visible at effectiveness review.
- **Reconciliation** against the controlled-copy register (spec §7.9): cannot pass until every issued copy accounted; forced-override logged. (Register itself is a module, Phase 9 — with a safe default when off: nothing to reconcile.)
- **Per-document training release** (spec §7.6) via the training seam.
- **Atomic supersession** on effective (Phase 1 primitive).
- **Effectiveness review** before closure (spec §7.12): independent approver (≠ requester).
- Both fronts (`CHANGE_SINGLE` HOD→QA then join at signatures; `CHANGE_MULTI` QA screen → per-doc review → join) converge on the shared tail.

**Guards/invariants.**
- Impact complete before classify — hard gate, no override.
- Concurrency: no two open changes silently editing one document.
- Signing depth = classification; completion check enforces the required set.
- Waiver admin-only + reason + logged.
- Reconciliation blocks until copies accounted (or logged force-override); safe default when register module off.
- Effectiveness review by an independent approver before closed.
- Supersession atomic.

**Screens.**
- **D-CHANGE-SCREEN — Change-control screening** (QA). Screen submitted changes: approve for work / clarify / reject. **Cannot pass impact until complete.** Assign/confirm classification (override + reason).
- **D-CHANGE-WORK — Change-control workstation** (QA). Manage an open change: affected documents, per-doc review status, signing-matrix progress, reconciliation status, training release. Drives the tail.
- **D-IMPACT — Impact assessment form.** Structured required fields; blocks submission if incomplete.
- **D-SIGN — Signature screen** (signatory). Apply e-signature where in the required set; captures signature meaning (Part 11).
- **D-RECONCILE — Reconciliation screen** (QA). Controlled-copy register status for the outgoing version; cannot confirm until all accounted; force-override (reason). (Present even if register module off — then trivially satisfied.)
- **D-EFFECTIVENESS — Effectiveness review** (independent approver). Confirm objective met; close. **Reviewer ≠ requester enforced.**
- **D-CLASSIFY — Classification matrix editor** (QA). Edit the data-driven matrix (impact→class, class→signatories); version-controlled.

**Configurability (scoped).**
- **Classification matrix** (per-tenant, QA-owned data): the thresholds and required-signatory sets are configurable — but the *existence* of classification and the *impact hard gate* are not.
- **Controlled-copy register on/off** (switchboard): when off, reconciliation is trivially satisfied (safe default); when on, it blocks until accounted.
- **Training seam on/off + threshold**: as Phase 6.
- **Effectiveness-review window/which-classes** (per-tenant config): configurable — but that critical/major changes get a review is fixed.
- **Not configurable:** impact hard gate, concurrency guard, SoD on signing and review, atomic supersession, waiver being admin-only-and-logged.

**Acceptance criteria.**
- Incomplete impact blocks submission (no override path).
- Classification sets the signing set; completion check enforces it.
- A document locked under one change cannot be edited by a second — it queues.
- A waiver requires admin + reason and is logged and surfaced at review.
- Reconciliation blocks until copies accounted; with the register module off it passes trivially.
- effective→closed is impossible without an independent effectiveness review.
- Supersession on effective is atomic (one effective version throughout).

**Definition of done.** Both change fronts flow through the shared tail with the impact hard gate, classification-driven depth, concurrency guard, signing matrix, reconciliation (with safe default), effectiveness review, and atomic supersession — all audited, all guards server-side.

---

## Phase 8 — Retirement pipe (discontinuation → destruction)

**Goal.** Discontinue a whole document through request → QA approval (with pre-checks) → retention hold → time-gated destruction (spec §8).

**Build.**
- States `retirement_requested → retirement_approved → pending_destruction → destroyed` (spec §8.2).
- **Retirement pre-checks** (spec §8.4): no active document references it; all training assignments closed; not cited in an active filing. Any failure blocks approval.
- **Retention time-gate** (spec §8.5): destruction cannot fire until the retention period elapses — DB-guarded date check. Destruction is an approved, logged event; content removed, **metadata + audit retained**.
- **Two paths into `retained`** (spec §8.6): supersession (automatic) and retirement (deliberate) converge on the same retention→destruction tail.
- Retention periods are per-tenant/per-type config (spec §14); the *gate* is not configurable, the *period value* is.

**Guards/invariants.**
- Pre-checks pass before approval; QA ≠ requester.
- Destruction only after retention expiry (time-gate) — non-negotiable.
- Destruction retains metadata + audit (never a true delete of the record's existence).

**Screens.**
- **D-RETIRE-REQUEST — Retirement request.** Raise discontinuation with justification.
- **D-RETIRE-REVIEW — Retirement review** (QA). See pre-check results (references/training/filing); approve/block; initiate retention hold.
- **D-DESTRUCTION — Destruction queue** (authorized role). Documents whose retention has expired; approve + log destruction. Time-gate visibly enforced.

**Configurability (scoped).**
- **Retention period values** (per-tenant/per-type): configurable data.
- **Not configurable:** the pre-checks, the retention time-gate, metadata/audit retention on destruction.

**Acceptance criteria.**
- Retirement with a failing pre-check (e.g. an active reference) is blocked.
- Destruction cannot be executed before retention expiry, regardless of role.
- Destruction removes content but retains metadata + audit; the record's history remains provable.
- Both supersession and retirement land versions in `retained` and follow the same destruction gate.

**Definition of done.** Whole-document retirement flows through pre-checked QA approval into a retention hold and time-gated, logged destruction that preserves metadata + audit; supersession and retirement share the tail.

---

## Phase 9 — Coupling modules (training, controlled-copy register) via seams

**Goal.** Attach the two coupling modules the core defers to, through the seam contract proven in the foundation — each with a safe default so the core flow never breaks when off.

**Build.**
- **Training / LMS module**: assign training on effective documents; record completion; report threshold; block untrained from execution. Couples at the effective window (Phases 6, 7). Safe default when off: no training required.
- **Controlled-copy register module**: `controlled_copies` (spec §10.6); issue copies with number + holder; reconciliation reads it. Couples at reconciliation (Phase 7). Safe default when off: nothing to reconcile (paperless). *For the M365 client who may be largely paperless, this module may stay off initially — the seam exists regardless.*
- Both write to the audit substrate; both are switchboard-controlled with per-tenant config.

**Guards/invariants.**
- Each module honors the seam contract; core uses the safe default when the module is off/absent (swap-test holds).
- A module that doesn't write audit is not connectable.

**Screens.**
- **D-TRAINING — Training assignment & status** (trainer/QA). Assign, record completion, show threshold, surface + confirm stragglers are blocked.
- **D-COPIES — Controlled-copy register** (QA). Issue/track copies; feeds D-RECONCILE.

**Configurability (scoped).**
- **On/off + config** (thresholds, whether copies are used) per tenant — allowed.
- **Not configurable:** when on, training blocks untrained execution; reconciliation blocks until copies accounted.

**Acceptance criteria.**
- Swap-test: core flows complete with each module off (safe default) and correctly defer when on — no core code change.
- Training on: untrained users blocked; stragglers tracked. Off: no training gate.
- Register on: reconciliation blocks until accounted. Off: reconciliation trivially satisfied.

**Definition of done.** Training and controlled-copy modules attach via seams with safe defaults; swap-test passes; both audited and switchboard-controlled.

---

## Phase 10 — Periodic review, dashboards & oversight

**Goal.** The scheduled-obligation layer and the oversight surfaces that make the system inspectable and manageable (spec §11 S19–S20).

**Build.**
- **Periodic review**: each effective document carries a next-review date; due/overdue surfaced; a review concluding "revise" raises a change request (into Phase 5 intake). Cadence is per-tenant config. Module via seam (safe default when off: dates stored, not proactively surfaced).
- **Dashboards**: open changes by state, overdue training, documents due for review, retention-expiry queue, in-flight bottlenecks.
- **Audit viewer** for document-control entities: reuses the foundation's S-AUDIT, scoped and filterable across document/version/change/retirement entities.

**Guards/invariants.**
- Periodic review off → dates still stored (safe default), manual review still possible.
- Oversight surfaces are read-scoped per role/plane.

**Screens.**
- **D-PERIODIC — Periodic review queue.** Due/overdue documents; initiate review → raises a change request.
- **D-DASHBOARD — Document-control dashboards.** State-of-the-system views.
- (Audit viewing via foundation **S-AUDIT**.)

**Configurability (scoped).**
- **Review cadence** (per-tenant/per-class): configurable.
- **Dashboard composition**: presentation-configurable.
- **Not configurable:** that review dates are tracked; audit completeness.

**Acceptance criteria.**
- A document reaching its review date surfaces as due; concluding a review can raise a change request.
- Dashboards reflect real state (open changes, overdue training, retention queue).
- With periodic-review module off, dates persist and manual review still works.

**Definition of done.** Periodic review, dashboards, and document-control audit viewing exist; scheduled obligations are tracked; the system is inspectable and manageable.

---

## B. Consolidated screen inventory (document-control core)

Grouped by function. These sit on top of the foundation's ~19 substrate screens.

**Consumption (core read surface + library module)**
- **D-READ** — Document read view (core; MS online viewer; effective-only, read-only).
- **D-HISTORY** — Version history (which version was effective when).
- **D-LIBRARY** — SOP Library working view (department-scoped default; configurable/styled).
- **D-MASTER-INDEX** — Master Index (tenant-wide, unscoped, filterable; full cross-department read).

**Intake**
- **D-INTAKE** — Start a request (one door; infer/confirm/dispute).

**New SOP pipe**
- **D-DRAFT** — Draft editor.
- **D-CHANGES** — Changes-requested response.
- **D-ENDORSE** — HOD endorsement queue (fallback when HOD = submitter).
- **D-QA-REVIEW** — QA review/approval.

**Change pipe**
- **D-CHANGE-SCREEN** — Change-control screening.
- **D-CHANGE-WORK** — Change-control workstation.
- **D-IMPACT** — Impact assessment form (hard gate).
- **D-SIGN** — Signature screen.
- **D-RECONCILE** — Reconciliation screen.
- **D-EFFECTIVENESS** — Effectiveness review.
- **D-CLASSIFY** — Classification matrix editor.

**Retirement pipe**
- **D-RETIRE-REQUEST** — Retirement request.
- **D-RETIRE-REVIEW** — Retirement review (pre-checks).
- **D-DESTRUCTION** — Destruction queue (time-gated).

**Modules (coupling)**
- **D-TRAINING** — Training assignment & status.
- **D-COPIES** — Controlled-copy register.

**Configuration**
- **D-NUMBERING-CONFIG** — Numbering format setup.

**Oversight**
- **D-PERIODIC** — Periodic review queue.
- **D-DASHBOARD** — Document-control dashboards.
- (Audit via foundation **S-AUDIT**; tasks via foundation **My tasks / inbox**.)

> ~24 document-control screens. Combined with the foundation's ~19, the platform is ~43 screens total. The document-control layer is where the user-facing richness lives; the foundation was deliberately lean substrate.

## C. How everything ties together (the assembled picture)

- **Foundation is the ground.** Audit substrate, tenancy/RLS, identity/roles, SoD primitive, governance planes, switchboard + seam contract. Everything below writes audit and respects tenancy.
- **Version store (Phase 1) is the spine.** System-id identity; one-effective-version; atomic supersession. Everything references system ids.
- **Read surface (Phase 2) is core consumption** — effective-only, read-only, configurable renderer (MS online). Never off.
- **Library + Numbering (Phases 3–4) are configurable experience** over the read surface — Master Index (tenant-wide read), department working view (organizing), company numbering as metadata. Off ⇒ core read still works.
- **Intake (Phase 5) is the one door** into the three pipes.
- **New SOP / Change / Retirement (Phases 6–8) are the pipes** — the state machine, all guards server-side, SoD from the foundation primitive.
- **Coupling modules (Phase 9)** attach at seams (effective window, reconciliation) with safe defaults — swap-test guarantees the flow never breaks.
- **Oversight (Phase 10)** makes it inspectable and surfaces scheduled obligations.

**The two laws that hold it together:**
1. **Configurable presentation, fixed enforcement (A.5).** Anything on the surface can bend per tenant; no guard can be weakened by config.
2. **Identity is the system id, human number is metadata (A.3).** Integrity is welded to the system, never to the company's numbering.

## D. Build sequence at a glance

```
Foundation (prior plan) ─────────────────────────────── must be complete
 └─ P1  Version store & identity          ← spine; system-id identity
     └─ P2  Read surface & rendition        ← core consumption (never off)
         ├─ P3  Library & Master Index      ← configurable experience
         ├─ P4  Numbering                   ← metadata, never identity
         └─ P5  Unified intake              ← one door
             ├─ P6  New SOP pipe
             ├─ P7  Change pipe             ← densest; classification, guards
             └─ P8  Retirement pipe
                 └─ P9  Coupling modules    ← training, copy register (seams)
                     └─ P10 Periodic review, dashboards, oversight
```

## E. Open items carried from FOUNDATIONS/SPEC (client QA must ratify)

- Classification matrix values (thresholds + signatory sets) — §7.
- Retention period values per document type — §8.
- Training threshold policy (and confirmation untrained are blocked) — §6, §7.
- Effectiveness-review window and which classes require it — §7.
- Periodic review cadence — §10.
- Whether the controlled-copy register is used (paperless vs physical copies) — §9.
- Whether the Master Index tenant-wide *full read* (A.4) should ever be a per-tenant toggle rather than fixed (currently settled as full read for this client).

*End of document-control core build plan.*

---
---

# PART II — DOCUMENT CONTROL SYSTEM SPECIFICATION

*(This is the detail the build plan's `spec §X` pointers resolve into. Section numbers here match the `spec §N` references in Part I.)*


> **Purpose of this document.** This is the build specification for the corrected document control system. It is written to be handed to an implementation agent. It describes the target state: every workflow, every state, every transition, every guard, every role, every screen, and the data model that supports them. Where the current system already does something correctly, that is noted so it can be kept rather than rebuilt. Where the current system has a gap, the gap and its fix are described in full.
>
> **How to read it.** Sections 1–3 are orientation (principles, roles, the regulatory "why"). Sections 4–9 are the workflows and states — the core of what to build. Section 10 is the data model. Section 11 is the screen inventory. Section 12 is the audit-trail and data-integrity layer that sits under everything. Section 13 is the gap register mapped to work items. Section 14 lists the decisions your client's QA must ratify before this is final.
>
> **Scope.** Multi-tenant platform; **single-site per tenant** (no branch level — settled in Part III). The system controls SOPs and equivalent controlled documents (work instructions, forms, specifications, templates). It does not cover executed records (batch records, logbooks) except where they reference controlled documents. *(Note: an earlier draft of this spec assumed single-tenant/multi-branch; the settled model in Part III supersedes that — multi-tenant, single-site. Where this spec says "branch," read "department" per Part III.)*

---

## 1. Design principles

These principles govern every decision in the rest of the document. When the agent faces an ambiguity not covered explicitly, resolve it in favour of these.

**1.1 Robust but easy.** The two goals are not in tension if the rigor is placed correctly. Rigor belongs in the *engine* — the state machine, the guards, the audit trail — where it is invisible to a well-behaved user and absolute against a misbehaving one. Ease belongs in the *surface* — one intake door, inferred request types, clear screens, no asking the user to classify things the system can determine. A user doing the right thing should feel almost no friction; the system should make the wrong thing impossible rather than warning against it.

**1.2 The engine is a state machine, not a status field.** Every controlled document and every change package is a finite state machine. A document is never in an ad-hoc condition; it is always in exactly one defined state, and it moves between states only through defined transitions, each of which has a named trigger, an actor with a required role, and a set of preconditions (guards). Illegal transitions are not merely discouraged — they are unrepresentable.

**1.3 Separate the document from its versions.** This is the single most important architectural correction. A *document* (the logical SOP — "SOP-042, Calibration of Torque Wrenches") has one identity for its whole life. A *version* (revision 00, 01, 02…) is a concrete artifact that gets drafted, approved, made effective, superseded, and retained. States like `effective`, `superseded`, and `retained` are properties of a **version**, not of the document. The document's state is a thin pointer ("active", "retired") to whichever version is currently in force. Modelling supersession on the document row — as the current system does by overwriting in place — is the root cause of the orphaned-retirement gap.

**1.4 Segregation of duties is enforced in the engine.** The author of a document cannot approve it. The approver cannot be the requester. These checks live in the transition guards (server-side), never only in the UI. Where a guard has no valid actor (e.g. the department head is themselves the author and would otherwise be the endorser), there is always a defined fallback, and the fallback is logged.

**1.5 Risk-based depth.** Every change goes through change control — there is no "minor edit skips the process" shortcut. But the *depth* of the path (who must sign, whether revalidation is triggered, whether regulatory notification is needed) is set by a risk classification performed at intake. Treating a typo and a validated-parameter change identically is itself a compliance failure: it either over-burdens trivial changes or under-controls serious ones.

**1.6 Everything is attributable, timestamped, and immutable.** Every state transition, signature, field edit, waiver, and override writes an audit-trail entry capturing who, what, when, the old value, the new value, and (where the action is discretionary) why. Audit entries are append-only. This is the ALCOA+ backbone and is non-negotiable.

**1.7 Decouple approval from effectiveness.** A document being approved (signed) and a document being effective (in force) are two different events separated by time. The gap is the training window and/or a scheduled future effective date. The system must represent "approved but not yet live" as a real state, never collapse it into "active".

**1.8 Block by default, override by exception, log always.** Where a real-world situation can legitimately require bypassing a control (a controlled copy destroyed in a fire, a required signatory who left the company), the control blocks by default, an authorized role can override, and the override is always logged with a reason. This pattern appears in reconciliation, signature waiver, and classification dispute.

---

## 2. Roles and permissions

Roles are the basis of every guard. The system defines the following roles. A real user may hold more than one role, but **the engine evaluates segregation-of-duties checks against the specific action**, so holding two roles never lets a user satisfy both sides of a separation requirement on the same record (e.g. being both author and approver of the same document).

### 2.1 Role definitions

| Role | Who they are | Core authority |
|------|-------------|----------------|
| **Author / Originator** | Any employee who creates or revises a document | Creates drafts, uploads content, supplies reason-for-change, responds to requested changes. Cannot approve or endorse their own submission. |
| **Department Head (HOD)** | The head of the department that owns the document | Endorses employee submissions before QA sees them. Confirms technical/operational correctness within their department. Cannot endorse a submission they themselves authored. |
| **QA Reviewer / Approver** | Quality Assurance staff | The sole release authority. Reviews, requests changes, approves, rejects, sets effective dates, screens change controls, confirms reconciliation, releases training. Cannot approve a document they authored or requested. |
| **Signatory** | Any manager or role designated in a change's signing matrix | Applies an electronic signature on a change package where their sign-off is required. The required set is determined by the change's classification. |
| **Trainer / Training Coordinator** | Owns the training/LMS coupling | Assigns training on effective documents, records completion, reports threshold status. (May be the same person as QA in a small org, subject to SoD on any single record.) |
| **Admin** | System administrator | Manages users and roles, may waive a signature or force a reconciliation **only** through logged, reason-required exception transitions. Admin power is constrained by the engine, not unlimited. |
| **Viewer / Read-only** | Any user who needs to read effective documents | Reads the current effective version from the repository. No workflow authority. The largest population of users. |

### 2.2 Permission principles

- **Least privilege.** A user sees and can act only on what their role permits. A Viewer never sees draft content; an Author sees their own drafts and effective documents but not others' in-flight work unless assigned.
- **Branch scoping.** In a multi-branch tenant, roles are scoped to branches where relevant. A HOD endorses for their department/branch, not globally. QA authority may be global or branch-scoped per the client's org design (see §14).
- **Action-level SoD.** The check is never "is this user a QA?" alone — it is "is this user a QA *and* not the author/requester of *this* record?" Implement SoD as a comparison of user identity against the record's author/requester fields at the moment of the transition.
- **Admin is auditable, not exempt.** Admin overrides are themselves controlled transitions that write audit entries and require reasons. There is no "admin does anything silently" path.

---

## 3. Regulatory grounding (the "why" behind the rigor)

This section exists so the agent understands *why* a control exists and does not optimize it away as friction. It is deliberately brief; the client's quality manual and the regulation text are the authoritative sources.

- **Lifecycle states and controlled change** derive from FDA 21 CFR Part 211 (cGMP), EU GMP Chapter 4 (Documentation), and ICH Q10 (Pharmaceutical Quality System). Every controlled document must have a defined lifecycle and every change must be governed.
- **Electronic signatures and audit trails** derive from FDA 21 CFR Part 11 and EU GMP Annex 11. Signatures must be attributable and permanently linked to the record; audit trails must be secure, computer-generated, timestamped, and capture old and new values.
- **Data integrity** is governed by ALCOA+: data must be Attributable, Legible, Contemporaneous, Original, and Accurate, plus Complete, Consistent, Enduring, and Available.
- **Risk-based change classification** derives from ICH Q9 (Quality Risk Management) and is expected by inspectors; minor/major/critical classification drives approval depth and validation effort.
- **Retention before destruction** is a records-management requirement: controlled records are held for a defined retention period and only then destroyed through an approved, logged event.

> **Important caveat for the agent and the client.** This specification reflects standard GxP patterns. It is **not** a regulatory certification. The specific retention periods, the classification matrix thresholds, and whether certain controls apply depend on the client's regulatory regime, product class, and their own ratified quality manual. Items requiring client ratification are collected in §14.

---

## 4. State reference (the complete state machine)

This section is the authoritative list of every state in the system. Sections 5–9 describe how documents move between them.

### 4.1 Document states (`documents.status`)

The document is the logical SOP. Its state is a thin lifecycle pointer.

| State | Meaning | Terminal? |
|-------|---------|-----------|
| `draft` | Being authored; no version has ever been effective | No |
| `in_review` | A version is moving through approval (covers HOD and QA review) | No |
| `pending_training` | Approved, waiting for training threshold before it can go effective | No |
| `scheduled` | Approved with a future effective date; not yet live | No |
| `active` | Has a current effective version; this is the normal live state | No |
| `locked_in_cc` | An effective document whose change is in progress (was `pending_cc`) | No |
| `retired` | Deliberately discontinued; no longer in use, retention hold may apply | Near-terminal |

> Note: `superseded`, `retained`, and `destroyed` are **removed from the document state set** and moved to the version state set (§4.2). This is the core architectural correction. The document does not become "superseded" — its *old version* does.

### 4.2 Version states (`document_versions.status`) — NEW state set

Each revision is a row in `document_versions`. This state set is **new**; the current system lacks it.

| State | Meaning |
|-------|---------|
| `draft` | This revision is being authored |
| `in_approval` | This revision is in the approval/signing flow |
| `approved` | Signed off, not yet effective (training/scheduling pending) |
| `effective` | The currently-in-force revision. **Exactly one** effective version per document at any time — enforced. |
| `superseded` | Was effective; a newer revision took over. Set **atomically** when the successor becomes effective. |
| `retained` | A superseded or retired version inside its retention period; preserved and retrievable, withdrawn from use |
| `destroyed` | Retention expired and destruction approved; content removed, metadata/audit retained |

### 4.3 Change package states (`change_controls.status`)

The change package governs one change, which may affect one or many documents.

| State | Meaning |
|-------|---------|
| `submitted` | Request raised; awaiting QA screening |
| `clarification_requested` | QA asked the requester for more information |
| `impact_pending` | Impact assessment incomplete — **cannot advance** until complete |
| `classified` | Impact complete, risk class assigned (minor/major/critical) |
| `queued` | Blocked because an affected document is locked under another open change |
| `approved_for_document_work` | Screening passed; document editing may begin |
| `documents_in_review` | Affected documents being reviewed/approved individually |
| `signatures_pending` | All documents approved; awaiting the required signature set |
| `pending_reconciliation` | Signed; awaiting controlled-copy reconciliation |
| `pending_training` | Reconciled; awaiting training threshold on affected documents |
| `effective` | Change is live; documents unlocked at new revisions |
| `effectiveness_review` | Live but not closed; awaiting independent confirmation it met its objective |
| `closed` | Effectiveness confirmed; package complete |
| `rejected` | Terminal; screening or review rejected the change |

> Removed dead states: `draft` and `qa_screening` from the current enum are eliminated unless `impact_pending`/`classified` replace their intent (they do). The CHECK constraint must match this list exactly so no documented state is unreachable.

### 4.4 Approval request states (`approval_requests.status`)

Tracks an individual review/approval cycle within either a new-SOP flow or a document-in-CC flow.

| State | Meaning |
|-------|---------|
| `pending` | Awaiting the current stage's actor |
| `changes_requested` | Sent back to author to revise |
| `approved` | This stage approved |
| `rejected` | This stage rejected |

With `approval_stage`: `hod_review` or `qa_review`.

### 4.5 Retirement states

Retirement of a whole document is tracked on the document plus a retirement record:

| State | Meaning |
|-------|---------|
| `retirement_requested` | Discontinuation proposed with justification |
| `retirement_approved` | QA approved; document withdrawn from use |
| `pending_destruction` | In retention hold; destruction not yet permitted |
| `destroyed` | Retention expired, destruction approved and logged |

---

## 5. The unified intake (one door, inferred routing)

### 5.1 Goal

A single entry point — one "Start a request" screen — that determines what kind of request this is and routes it into the correct pipe, without asking the user to self-classify. This is the "easy" surface over the "robust" engine.

### 5.2 Inference logic

At intake the system captures: an optional target document, optional additional documents (scope), the uploaded content where applicable, and a mandatory reason. From these it infers the request **type**:

- **No target document selected** → `NEW_SOP`. There is no predecessor to supersede, no impact on existing effective states.
- **One effective target document** → `CHANGE_SINGLE`. A change against one existing document.
- **More than one target document** → `CHANGE_MULTI`. A change control spanning several documents.
- **Target document + intent flag "discontinue"** → `RETIRE`. The process the document describes no longer exists.

> **Guard — inference keys off `effective`, not any row.** The new-vs-change decision must check whether an *effective* version exists for the target, not merely whether any document row exists. An abandoned draft must not cause a brand-new document to be misrouted as a change against nothing.

### 5.3 Confirm with visible rationale

The system shows the user its inference *and the reason for it* ("You selected SOP-042, which is effective, so this will be handled as a change"). The user confirms. The user **cannot freely relabel** the type — but they **can dispute** it (§5.4). Confirmation with a visible rationale is what makes "cannot relabel" defensible rather than a black box.

### 5.4 Dispute path

If the user believes the inference is wrong (e.g. a document is technically effective but functionally dead), they dispute. A dispute routes to QA to re-evaluate the type. If QA overrides the inferred type, the override is **logged with a reason**. This is the pressure-relief valve that keeps the rigid inference from becoming a trap.

### 5.5 Abandoned-draft fork

If the user starts a new SOP and a prior unfinished draft of an apparently-matching document exists, the system surfaces the existing draft and asks the user to **resume or start fresh**. The choice is logged. This prevents both ghost-draft accumulation and accidental attachment of new work to a stale request.

### 5.6 Lock the type at dispatch, not at capture

The inferred type can still shift while the user adds or removes documents from scope during intake. The type is **locked only at dispatch** — the moment the request is handed to a pipe. After dispatch the type is immutable for that request.

### 5.7 Intake decision summary

| Signal | Inferred type | Routes to |
|--------|--------------|-----------|
| No effective target | `NEW_SOP` | New SOP pipe (§6) |
| One effective target | `CHANGE_SINGLE` | Change pipe (§7), single-doc front |
| Many targets | `CHANGE_MULTI` | Change pipe (§7), multi-doc front |
| Target + discontinue intent | `RETIRE` | Retirement pipe (§8) |

---

## 6. Pipe 1 — New SOP (creation → active)

### 6.1 Narrative

An author uploads content and supplies a reason. Employee submissions are endorsed by their department head before QA; manager submissions go straight to QA. QA is the sole approver and can never approve their own submission. On approval, the document either goes effective immediately, waits for a training threshold, or waits for a scheduled future effective date. The first effective version is revision 00.

### 6.2 States traversed

`draft → in_review (hod) → in_review (qa) → [approved] → {pending_training | scheduled | active}`
with the version moving `draft → in_approval → approved → effective`.

### 6.3 Transitions, triggers, actors, guards

| From | To | Trigger | Actor | Guards |
|------|----|---------|-------|--------|
| ∅ | `pending_hod` | submit (employee) | Author (employee) | Reason-for-change present; content attached |
| ∅ | `pending_qa` | submit (manager) | Author (manager) | Reason present; content attached |
| `pending_hod` | `pending_qa` | endorse | HOD | **HOD ≠ submitter** (else fallback §6.4) |
| `pending_qa` | `changes_requested` | request changes | QA or HOD | — |
| `changes_requested` | `pending_qa` | resubmit | Author | Revision history preserved |
| `pending_qa` | `draft` (rejected) | reject | QA or Admin | **Reason required; draft + reason retained, not deleted** |
| `pending_qa` | `approved` | approve | QA | **QA ≠ submitter and QA ≠ author** |
| `approved` | `pending_training` | approve-with-training | QA | Training flagged required |
| `approved` | `scheduled` | set future effective date | QA | Effective date > today |
| `approved` | `active` | activate (no training, today) | QA | Effective date = today, no training |
| `pending_training` | `active` / `scheduled` | training threshold met | QA / system | Threshold % reached; **untrained users blocked from execution** |
| `scheduled` | `active` | effective date arrives | system (scheduled job) | Date check |

### 6.4 Guard detail — HOD is the submitter

If the department head is the author of the document, the normal endorser is invalid (would violate SoD). The system must route endorsement to a **defined fallback**: a peer HOD, a designated deputy, or QA acting as endorser. The fallback choice and actor are logged. Without this, an HOD-authored document either stalls forever or someone disables the SoD check — both unacceptable.

### 6.5 Guard detail — training threshold and stragglers

If the document goes effective at a threshold below 100% trained (a legitimate practice), the untrained population must be **actively blocked from executing** the SOP, not merely flagged. The audit trail records the trained percentage at go-live and tracks stragglers to completion. The system must be able to show an inspector: who was trained, when, and that nobody executed before training. Without enforced blocking, the threshold is a finding.

### 6.6 Guard detail — future effective date

Setting an effective date in the future puts the document in `scheduled`, **not** `active`. A scheduled job (or a date check on read) flips it to `active` when the date arrives. The previous reality holds until then. This is the same approval-vs-effectiveness decoupling as training, applied to scheduling.

### 6.7 Guard detail — reject preserves history

A rejected request returns the document to `draft` with the rejection reason recorded. The rejection is part of the document's audit history (an inspector may ask "was this ever rejected and why?"). Reject must never delete the row.


---

## 7. Pipe 2 — Change (request → change control → effective)

This is the densest pipe and carries the most compliance weight. It has two fronts (single-document and multi-document) that converge on one shared tail. The shared tail is where most rigor lives.

### 7.1 Narrative

A change request is raised against one or more existing effective documents. Before anything routes, a **mandatory impact assessment** is completed (incomplete fields block submission) and the change is **classified** minor/major/critical. The affected document(s) are checked for **lock conflicts** with other open changes. The document(s) lock and their revision bumps to NN+1. The change moves through document review, then a **classification-driven signature set**, then **reconciliation** against the controlled-copy register, then training, then effective. After going live it is **not closed** until an independent **effectiveness review** confirms it met its objective.

### 7.2 Mandatory impact assessment (NEW — hard gate)

Before a change can be submitted, the requester completes an impact assessment covering at minimum: which documents are affected, whether training is required and for whom, whether executed-record templates are affected, which systems/equipment are touched, and whether revalidation or regulatory notification may be needed.

> **Guard — incomplete impact blocks submission.** The `impact_pending` state cannot advance to `classified` until required fields are complete. There is **no "submit anyway"**. This is enforced server-side in the RPC, not just by UI validation.

### 7.3 Risk classification (NEW)

Based on the impact assessment, the change is classified:

| Class | Typical examples | Drives |
|-------|-----------------|--------|
| **Minor** | Typo, formatting, clarification with no procedural effect | Short approval path; no revalidation |
| **Major** | Procedural step change, role change, new form field | Full review, training-on-change, fuller signature set |
| **Critical** | Change to a validated parameter, safety-relevant change, regulatory-filing-relevant change | Impact assessment + possible revalidation + regulatory notification + heaviest signature set |

> The **classification matrix** (the exact rules for what lands where) must be ratified by the client's QA (§14). The system stores the matrix as data, not hardcoded, so QA can adjust thresholds without a code change. Classification can be proposed by the system from the impact answers but must be **confirmable/overridable by QA with a logged reason**.

### 7.4 Concurrency guard (NEW)

When a change targets a document, the system checks whether that document is already locked under another open change control.

> **Guard — lock conflict.** If an affected document is already in `locked_in_cc` under a different open change, the new change enters `queued` and waits for the lock to clear, or is blocked with a clear message. This prevents two changes silently clobbering each other's revisions. Critical for multi-document changes where overlap is invisible until two people edit the same document in the same window.

### 7.5 States traversed (shared tail)

```
submitted
  → clarification_requested (loop) 
  → impact_pending → classified
  → [concurrency check] → queued (if locked) → 
  → approved_for_document_work → documents_in_review
  → signatures_pending
  → pending_reconciliation
  → pending_training (if any doc needs training)
  → effective
  → effectiveness_review
  → closed
(rejected = terminal from screening or review)
```

The single-doc front (`CHANGE_SINGLE`) goes HOD→QA approval, then `create_change_control` locks the document and joins directly at `signatures_pending` (it has already been document-reviewed via the approval path). The multi-doc front (`CHANGE_MULTI`) goes through QA screening and per-document review, then joins at `signatures_pending`. From `signatures_pending` onward the tail is identical.

### 7.6 Transitions, triggers, actors, guards (shared tail)

| From | To | Trigger | Actor | Guards |
|------|----|---------|-------|--------|
| `submitted` | `clarification_requested` | request clarification | QA | — |
| `clarification_requested` | `submitted` | resubmit | Requester | — |
| `submitted` | `rejected` | reject | QA | Reason required; terminal |
| `submitted` | `impact_pending` | begin screening | QA | — |
| `impact_pending` | `classified` | complete impact + classify | QA | **All required impact fields present** |
| `classified` | `queued` | lock conflict detected | system | An affected doc is locked elsewhere |
| `queued` | `approved_for_document_work` | lock clears | system | No remaining conflicts |
| `classified` | `approved_for_document_work` | approve for work | QA | No lock conflict |
| document(s) | `locked_in_cc` + revision NN+1 | create_change_control | QA | **Document locked; revision bumped** |
| `approved_for_document_work` | `documents_in_review` | open document work | QA | — |
| `documents_in_review` | `signatures_pending` | all docs approved | QA | Every affected document approved |
| `signatures_pending` | `signatures_pending` | apply signature | Signatory | Signature linked to record + user |
| `signatures_pending` | (waiver applied) | waive signature | **Admin only** | **Reason required; logged immutably** |
| `signatures_pending` | `pending_reconciliation` | completion check | system trigger | **All required signed or waived** |
| `pending_reconciliation` | `pending_reconciliation` | reconcile copies | QA | Checks controlled-copy register |
| `pending_reconciliation` | (forced) | force-reconcile | Authorized role | **Reason required; logged** (fire/closed-site case) |
| `pending_reconciliation` | `pending_training` | confirm (training needed) | QA | At least one affected doc needs training |
| `pending_reconciliation` | `effective` | confirm (no training) | QA | **Every issued copy accounted for** |
| `pending_training` | `effective` | release after threshold | QA | Per-doc threshold met; stragglers blocked |
| `effective` | `effectiveness_review` | enter review window | system | After defined period |
| `effectiveness_review` | `closed` | confirm objective met | **Independent approver** | Reviewer ≠ change requester |
| any open | `closed` | close | QA/Admin | — |

### 7.7 Guard detail — signature matrix from classification

The set of required signatories is determined by the change's class. Minor: a reduced set (e.g. QA only or QA + owning HOD). Major: owning managers + QA. Critical: extended set possibly including site quality head and affected-system owners. The matrix is stored as data keyed by class (and possibly by affected document type), ratifiable by QA. The completion check (`check_cc_completion`) passes only when every member of the required set has signed or been waived.

### 7.8 Guard detail — waiver

A signature waiver is the most abusable transition in the system (it makes a document effective without a required approval). Therefore:
- **Admin-only**, enforced in the RPC.
- **Reason required.**
- **Logged immutably** in the audit trail.
- Surfaced in the change record so it is visible at effectiveness review.

### 7.9 Guard detail — reconciliation and the copy register

`pending_reconciliation` checks the controlled-copy register (§10.6). It cannot advance to effective until **every issued controlled copy of the outgoing version is accounted for** (returned or destroyed). The forced-override path exists for genuine exceptions (a copy destroyed in a fire, a contract site closed) and is logged with a reason. If the client is fully paperless (no physical copies issued), this step is near-trivial but the state still exists for completeness.

### 7.10 Guard detail — revision-number burn policy

When a change locks a document, the revision bumps to NN+1. **Decision required (§14):** if that change is later rejected or abandoned, is NN+1 burned (leaving a visible gap: 00, 01, 03) or reclaimed (number allocated only at effective time)? Either is defensible but the system must do one consistently, because an inspector seeing a revision gap will ask. Recommendation: allocate the displayed revision number only at the `effective` transition, holding a provisional internal id while in flight — this avoids gaps entirely.

### 7.11 Guard detail — supersession atomicity

When a change goes `effective`, two writes must happen in **one transaction**: the new version becomes `effective`, and the previously-effective version becomes `superseded`. If these are two steps and the process dies between them, the system has either two effective versions (catastrophic — two "current" SOPs) or zero. Implement as a single atomic RPC.

### 7.12 Guard detail — effectiveness review

A change is **not closed when it goes effective**. After a defined period it enters `effectiveness_review`: did the change achieve its objective, were there unintended effects? Closure is a separate controlled step performed by an **independent approver** (not the change requester), especially for major/critical changes. This step is currently missing entirely and must be added.

---

## 8. Pipe 3 — Retirement (discontinuation → destruction)

### 8.1 Narrative

Retirement is for when a whole document is discontinued — the process it describes no longer exists. This is distinct from revision (which supersedes an old *version*). Retirement is lighter than change control (nothing is authored) but still needs a request, QA approval, pre-checks, and — critically — a **retention hold** before destruction.

### 8.2 States traversed

`retirement_requested → retirement_approved → pending_destruction → destroyed`
(document moves `active → retired`; its current version moves `effective → retained → destroyed`)

### 8.3 Transitions, triggers, actors, guards

| From | To | Trigger | Actor | Guards |
|------|----|---------|-------|--------|
| `active` | `retirement_requested` | request retirement | Any active user | Justification required |
| `retirement_requested` | (blocked) | pre-check fails | system | See §8.4 |
| `retirement_requested` | `retirement_approved` | approve | QA | **Pre-checks pass**; QA ≠ requester |
| `retirement_approved` | `pending_destruction` | withdraw from use | QA | Document marked `retired`, version `retained` |
| `pending_destruction` | (held) | retention not expired | system | **Time-gate: retention period not elapsed** |
| `pending_destruction` | `destroyed` | destroy | Authorized role | **Retention expired**; reason + approval logged |

### 8.4 Guard detail — retirement pre-checks

Before QA can approve retirement, three checks must pass:
1. **No active document references this one** (no effective SOP points to it).
2. **All open training assignments for it are closed.**
3. **It is not cited in an active regulatory submission/filing.**

Any failure blocks approval with a clear reason. These prevent retiring a document that something still depends on.

### 8.5 Guard detail — retention time-gate

This is the single most important new control in the retirement pipe. Destruction **cannot** fire until the retention clock has elapsed, regardless of who requests it. The retention period is set per document type/regime (§14). `pending_destruction → destroyed` is guarded by a date check; the destruction itself is an approved, logged event capturing who authorized it, when, and the method. `destroyed` removes content but **retains metadata and audit trail** (you must still be able to prove the document existed and was destroyed properly).

### 8.6 Two paths into `retained`

A version reaches `retained` by either route:
- **Supersession** — its successor became effective (automatic, frequent). Happens on every revision.
- **Retirement** — the whole document was deliberately discontinued (rare).

Both converge on the same retention-then-destruction tail.


---

## 9. Supersession and version lifecycle (cross-cutting)

This section consolidates how versions live and die, because it spans pipes 2 and 3.

- **One effective version per document, always.** Enforced by a constraint or by the atomic supersession RPC. The system must never permit two `effective` versions of the same document.
- **The document row points; the version row carries state.** `documents.current_version_id` references the effective version. Document status (`active`/`retired`) is a lifecycle pointer; the rich states (`effective`/`superseded`/`retained`/`destroyed`) live on the version.
- **Supersession is atomic** (§7.11): on `effective`, successor→`effective` and predecessor→`superseded` in one transaction.
- **Retention applies to superseded and retired versions alike.** Both sit in `retained` for the retention period, then move to `destroyed` via the time-gated, approved event.
- **History is always retrievable.** For any past date, the system can answer "which version was effective then?" from the version rows and their effective/superseded timestamps. This is what lets an inspector pull "the SOP effective in March".

---

## 10. Data model

This describes the tables and key columns the system needs. Existing tables that already exist are noted; new ones are flagged **NEW**.

### 10.1 `documents`

The logical SOP. One row per document for its whole life.

| Column | Notes |
|--------|-------|
| `id` | PK |
| `document_number` | Human ID, e.g. SOP-042; stable for life |
| `title` | |
| `department_id` / `branch_id` | Ownership + scoping |
| `status` | One of §4.1 |
| `current_version_id` | FK to the effective version (nullable while never-yet-effective) |
| `owner_id` | Owning role/user |
| `created_at`, `updated_at` | |

### 10.2 `document_versions` — state set is NEW

One row per revision.

| Column | Notes |
|--------|-------|
| `id` | PK |
| `document_id` | FK |
| `revision_number` | Two-digit GMP number (00, 01, 02…). **Allocated at effective time** per §7.10 recommendation |
| `status` | One of §4.2 (**NEW** state set) |
| `content_ref` | Pointer to stored content/rendition |
| `effective_from` | Timestamp it became effective |
| `superseded_at` | Timestamp it was superseded (nullable) |
| `retention_until` | **NEW** — when retention expires and destruction becomes permissible |
| `reason_for_change` | Carried from the originating request |
| `created_at` | |

### 10.3 `change_controls`

The change package.

| Column | Notes |
|--------|-------|
| `id` | PK |
| `type` | `CHANGE_SINGLE` / `CHANGE_MULTI` |
| `status` | One of §4.3 |
| `classification` | **NEW** — minor / major / critical |
| `impact_assessment` | **NEW** — structured fields; completeness enforced |
| `requester_id` | For SoD checks |
| `created_at`, `closed_at` | |

### 10.4 `change_control_documents`

Join table: which documents a change affects (supports multi-doc).

| Column | Notes |
|--------|-------|
| `change_control_id` | FK |
| `document_id` | FK |
| `target_version_id` | The new revision being produced |
| `needs_training` | Per-document training flag |
| `released_at` | Per-document release timestamp (for staggered training release) |

### 10.5 `approval_requests`

| Column | Notes |
|--------|-------|
| `id` | PK |
| `document_id` / `version_id` | Subject |
| `change_control_id` | Nullable; set when part of a CC |
| `status` | One of §4.4 |
| `approval_stage` | `hod_review` / `qa_review` |
| `actor_id` | Who acted |
| `reason` | For changes-requested / reject |

### 10.6 `controlled_copies` — NEW

The controlled-copy register that makes reconciliation verifiable.

| Column | Notes |
|--------|-------|
| `id` | PK |
| `copy_number` | Sequential per document/version |
| `document_version_id` | Which version this copy reproduces |
| `holder` | Person/location holding it (shop floor, parts desk, contract site) |
| `issued_at` | |
| `status` | `issued` / `reconciled` (returned or destroyed) |
| `reconciled_at` | |
| `reconciled_method` | returned / destroyed / force-overridden |

### 10.7 `signatures`

| Column | Notes |
|--------|-------|
| `id` | PK |
| `change_control_id` / `version_id` | Subject |
| `signatory_id` | |
| `signed_at` | |
| `meaning` | What the signature attests (review/approve/release) — Part 11 requires the meaning be captured |
| `waived` | Boolean |
| `waived_by` | Admin id if waived |
| `waiver_reason` | Required if waived |

### 10.8 `retirements` — NEW

| Column | Notes |
|--------|-------|
| `id` | PK |
| `document_id` | FK |
| `status` | One of §4.5 |
| `justification` | Required |
| `requester_id`, `approver_id` | SoD |
| `precheck_results` | References/training/filing check outcomes |
| `destroyed_at`, `destruction_method`, `destruction_approver_id` | |

### 10.9 `audit_trail` — cross-cutting, append-only

| Column | Notes |
|--------|-------|
| `id` | PK |
| `entity_type` | document / version / change_control / signature / copy / retirement |
| `entity_id` | |
| `action` | Transition or field change |
| `actor_id` | Who |
| `occurred_at` | Server timestamp (contemporaneous) |
| `old_value`, `new_value` | For field/state changes |
| `reason` | For discretionary actions (waiver, override, reject, dispute) |

Append-only. No updates, no deletes. This is the ALCOA+ backbone.

### 10.10 `classification_matrix` — NEW, data-driven

Stores the rules mapping impact answers → class, and class → required signatory set. Editable by QA without code change. Versioned itself (the matrix is a controlled artifact).

---

## 11. Screen inventory

Screens grouped by role and workflow. For each: purpose, key elements, and the guards the UI must reflect (while remembering the real enforcement is server-side).

### 11.1 Universal / shared

**S1 — Repository (current effective documents).** The single source of truth. Lists effective documents, scoped by branch/department. Opens the current effective version as a read-only / watermarked rendition. Largest-traffic screen; must be fast and simple. Viewers see only this.

**S2 — Document detail / history.** Shows a document's current version plus its full version history (effective dates, supersession, who approved). The screen that answers "which version was effective in March". Read access broad; in-flight detail role-gated.

**S3 — Unified intake ("Start a request").** §5. One door. Captures target(s), reason, content. Shows the inferred type with rationale. Confirm / dispute. Surfaces the abandoned-draft fork. This is the primary "easy" surface — keep it clean.

**S4 — My tasks / inbox.** Role-aware queue: items awaiting *this* user's action (endorse, review, sign, reconcile, release training, effectiveness review). The workflow engine's face to each user.

### 11.2 Author screens

**S5 — Draft editor.** Upload/edit content, supply reason-for-change, attach impact answers for changes. Submit. Shows current state and what happens next.

**S6 — Changes-requested response.** When QA/HOD requests changes, the author sees the request, the reason, and revises/resubmits. Preserves prior versions visibly.

### 11.3 HOD screens

**S7 — Endorsement queue.** Employee submissions awaiting this HOD. Endorse or request changes. **UI must hide/disable endorse when HOD = submitter** and surface the fallback route (§6.4).

### 11.4 QA screens

**S8 — QA review/approval.** The core QA workstation. Review content, request changes, reject (reason required), approve. Set training requirement. Set effective date (today or scheduled). **Approve disabled when QA = author/submitter.**

**S9 — Change-control screening.** Screen submitted changes: approve for work / request clarification / reject. **Cannot proceed past impact until impact complete.** Assign/confirm classification (with override + reason).

**S10 — Change-control workstation.** Manage an open change: affected documents, per-document review status, signature matrix progress, reconciliation status, training release. Drive the change through its tail.

**S11 — Reconciliation screen.** Shows the controlled-copy register for the outgoing version: every issued copy and its status. Cannot confirm until all accounted; force-override available (reason required) for exceptions.

**S12 — Effectiveness review.** After a change is live, the review screen for an independent approver to confirm objective met and close. **Reviewer ≠ requester enforced.**

**S13 — Retirement review.** Review a retirement request; see pre-check results (references/training/filing); approve or block. Initiate retention hold.

### 11.5 Signatory screens

**S14 — Signature screen.** Apply an electronic signature to a change package where this user is in the required set. Captures meaning of signature (Part 11). Shows what is being attested.

### 11.6 Training screens

**S15 — Training assignment & status.** Assign training on effective documents; record completion; show threshold status per document; surface stragglers (and confirm they are blocked from execution).

### 11.7 Admin screens

**S16 — User & role management.** Users, roles, branch scoping.

**S17 — Exception console.** Where waivers and forced reconciliations are performed — **always reason-required, always logged**. This screen must make the gravity visible; it is the most sensitive surface in the system.

**S18 — Classification matrix editor.** Edit the data-driven matrix (impact→class, class→signatories). The matrix is itself version-controlled.

### 11.8 Oversight screens

**S19 — Audit-trail viewer.** Read-only, filterable view of the append-only audit trail by entity, actor, date. The screen you open in front of an inspector.

**S20 — Dashboards.** Open changes by state, overdue training, documents due for periodic review, retention-expiry queue, in-flight bottlenecks.

> **Periodic review note.** Beyond the request-driven flows, effective documents are subject to **periodic review** (typically every 1–3 years, per client policy). The system should track each document's next-review date and surface due/overdue items on S20, raising a change request when a review concludes a revision is needed. This is a scheduled obligation distinct from event-driven change.


---

## 12. Audit trail & data integrity (the layer under everything)

This is not a feature; it is a property the whole system must have. Every section above assumes it.

### 12.1 What must be captured

Every one of the following writes an audit entry: state transition, signature application, signature waiver, field edit on a controlled record, classification assignment/override, reconciliation confirmation, force-override, rejection, dispute/override of inferred type, training threshold/release, retirement approval, destruction.

### 12.2 What each entry contains

Who (actor identity), what (action/transition), when (server-side timestamp — contemporaneous), the old value and new value where applicable, and the reason where the action is discretionary.

### 12.3 Properties

- **Append-only.** No updates, no deletes, ever. Enforced at the database level (no UPDATE/DELETE grants on the audit table; ideally a trigger that rejects them).
- **Attributable.** Every entry ties to an authenticated user. No shared accounts for controlled actions.
- **Contemporaneous.** Timestamps are server-generated at the moment of action, not client-supplied.
- **Secure & enduring.** Survives for the document's full retention period and beyond.

### 12.4 ALCOA+ mapping

| Principle | How the system satisfies it |
|-----------|----------------------------|
| Attributable | Authenticated actor on every entry/signature |
| Legible | Structured, human-readable audit viewer (S19) |
| Contemporaneous | Server timestamps at action time |
| Original | Version content preserved; superseded versions retained |
| Accurate | Guards prevent invalid transitions; classification enforced |
| Complete | Every action audited, including failures/overrides |
| Consistent | State machine enforces one valid path |
| Enduring | Append-only storage through retention |
| Available | Repository + history + audit viewer retrievable on demand |

### 12.5 Electronic signature requirements (Part 11 / Annex 11)

- Each signature captures: signer identity, timestamp, and the **meaning** of the signature (what it attests).
- The signature is **permanently linked** to the record signed and cannot be excised or copied to another record.
- Signing requires authentication (the act of signing is itself an authenticated event).
- Waivers are signatures' shadow: admin-only, reason-required, logged, visible at effectiveness review.

---

## 13. Gap register → work items

This maps each correction to current-system reality, with severity and the work required. **Keep** = current behaviour is correct. **Adjust** = modify existing. **Build** = net-new.

| # | Item | Current state | Action | Severity | Work |
|---|------|--------------|--------|----------|------|
| 1 | Version-level state set | States live on document row; overwrite-in-place | **Build** | High | Add `document_versions.status` (§4.2); migrate supersession logic to version |
| 2 | Supersession atomicity | Old version silently overwritten | **Build** | High | Atomic RPC: successor→effective + predecessor→superseded in one txn |
| 3 | Retirement workflow | Unreachable; orphaned | **Build** | High | New `retirements` table + states (§8); pre-checks; QA approval |
| 4 | Retention time-gate | Absent | **Build** | High | `retention_until`; guard on destruction; approved logged destruction event |
| 5 | Controlled-copy register | Reconciliation is unverifiable assertion | **Build** | Med-High | `controlled_copies` table (§10.6); reconciliation reads it; force-override path |
| 6 | Mandatory impact assessment | Absent | **Build** | High | `impact_assessment` fields; `impact_pending` hard gate (no submit-anyway) |
| 7 | Risk classification | Absent; everything uniform rigor | **Build** | High | `classification` + data-driven matrix (§10.10); drives signature set |
| 8 | Classification-driven signature matrix | Single uniform signing | **Adjust/Build** | High | Matrix keyed by class; completion check reads required set |
| 9 | Concurrency / lock conflict | Single-doc lock only; multi-doc overlap unguarded | **Build** | High | Lock-conflict check; `queued` state |
| 10 | Effectiveness review before closure | effective→closed in one move | **Build** | Med | `effectiveness_review` state; independent approver guard |
| 11 | HOD-is-submitter fallback | Undefined | **Build** | Med-High | Fallback endorser routing; logged |
| 12 | Training straggler blocking | Threshold exists; blocking unclear | **Adjust** | High | Enforce execution block for untrained; record %, track stragglers |
| 13 | Future effective date / scheduled | Likely collapsed into active | **Adjust/Build** | Med | `scheduled` state; date-driven activation |
| 14 | Reject preserves history | To verify | **Verify/Adjust** | Med | Ensure reject retains draft + reason, never deletes |
| 15 | Revision-number burn policy | Bumped at lock; abandon behaviour undefined | **Adjust** | Low-Med | Allocate display revision at effective time (recommended) |
| 16 | Dead enum states | `draft`, `qa_screening` unreachable | **Adjust** | Low | Remove from CHECK or repurpose to `impact_pending`/`classified` |
| 17 | Unified intake + inference | Two separate entries | **Build** | Med | Intake router; infer/confirm/dispute; abandoned-draft fork |
| 18 | Audit trail completeness | Partial | **Verify/Adjust** | High | Ensure every §12.1 action audited; append-only enforced |
| 19 | Periodic review tracking | To verify | **Build/Adjust** | Med | Next-review dates; due/overdue surfacing |
| 20 | Keep: no-self-approve | Correct | **Keep** | — | Maintain action-level SoD |
| 21 | Keep: mandatory HOD endorsement | Correct | **Keep** | — | Maintain (plus add fallback #11) |
| 22 | Keep: every revision through CC | Correct | **Keep** | — | Maintain; add classification depth |
| 23 | Keep: two-digit GMP revisions | Correct | **Keep** | — | Maintain |
| 24 | Keep: lock during open CC | Correct for single-doc | **Keep** | — | Extend to multi-doc via #9 |

### 13.1 Suggested build sequence

1. **#16** (remove dead states — trivial, clears confusion).
2. **#1, #2** (version-level state + atomic supersession — foundational; everything else assumes it).
3. **#6, #7, #8** (impact + classification + signature matrix — the change-pipe core).
4. **#9** (concurrency guard — depends on locking model).
5. **#3, #4** (retirement + retention — independent track).
6. **#5** (copy register — if client uses physical copies; see §14).
7. **#10, #11, #12, #13** (effectiveness review, HOD fallback, straggler blocking, scheduling).
8. **#17** (unified intake — routing layer over the now-correct pipes).
9. **#14, #18, #19** (history preservation, audit completeness, periodic review — verification + surfacing passes).

---

## 14. Decisions the client's QA must ratify

These are not engineering decisions; the system stores them as data, but the *values* must come from the client's quality organization before go-live.

1. **Classification matrix.** The exact rules for minor vs major vs critical, and the required signatory set for each. The system holds this as editable data (§10.10), but QA must author and approve the initial matrix.
2. **Retention periods.** How long superseded and retired versions are held before destruction becomes permissible — varies by document type and regulatory regime.
3. **Controlled copies — applicable or not.** Whether the client issues physical controlled copies (shop-floor printouts, contract-site copies) or runs fully paperless. Determines whether the copy register (#5) is load-bearing or near-trivial.
4. **Periodic review cadence.** The review interval per document class (commonly 1–3 years).
5. **QA scoping.** Whether QA approval authority is global across branches or branch-scoped, in the multi-branch tenant model.
6. **Training threshold policy.** Whether documents may go effective below 100% trained, and at what threshold — plus confirmation that untrained users are blocked from execution.
7. **Effectiveness-review window.** How long after a change goes effective the effectiveness review occurs, and for which classes it is mandatory.
8. **Regulatory regime confirmation.** Which framework(s) the client operates under (FDA/EMA/other; and whether device-specific clauses apply). This validates the whole specification against the right clause set.

> **Final caveat.** This specification follows standard GxP/GMP patterns and is a sound, robust blueprint. It is **not** a compliance certification. Before go-live, the controls here should be checked against the relevant regulation text and the client's own ratified quality manual. The source of truth for any audit is the regulation and the quality manual, not this document.

---

## Appendix A — Quick state-transition index

**Document:** `draft → in_review → {pending_training | scheduled} → active → locked_in_cc → active → retired`

**Version:** `draft → in_approval → approved → effective → superseded → retained → destroyed`

**Change control:** `submitted → [clarification] → impact_pending → classified → [queued] → approved_for_document_work → documents_in_review → signatures_pending → pending_reconciliation → [pending_training] → effective → effectiveness_review → closed` (+ `rejected` terminal)

**Approval request:** `pending → {changes_requested → pending | approved | rejected}` across stages `hod_review`, `qa_review`

**Retirement:** `retirement_requested → retirement_approved → pending_destruction → destroyed`

## Appendix B — Guard checklist (server-side, non-negotiable)

- [ ] Author ≠ approver on every approval (action-level)
- [ ] HOD ≠ submitter on endorsement; fallback routed + logged
- [ ] QA ≠ requester on change approval and effectiveness review
- [ ] Impact assessment complete before classification (no submit-anyway)
- [ ] Lock-conflict check before document work; queue if locked
- [ ] One effective version per document (constraint)
- [ ] Supersession atomic (single transaction)
- [ ] All required signatures (per class) or logged waiver before reconciliation
- [ ] Waiver admin-only, reason-required, logged
- [ ] Every issued copy accounted before effective, or logged force-override
- [ ] Untrained users blocked from execution; stragglers tracked
- [ ] Scheduled documents not live until effective date
- [ ] Retirement pre-checks pass before approval
- [ ] Retention expired before destruction (time-gate)
- [ ] Destruction approved + logged; metadata/audit retained
- [ ] Every controlled action writes an append-only audit entry
- [ ] Reject preserves draft + reason (never deletes)

*End of specification.*

---
---

# PART III — PLATFORM FOUNDATIONS (settled decisions)

*(This is what `FOUNDATIONS §X` and the settled-decision references in Part I resolve into.)*


> **What this document is.** This is *not* the build plan. It is the set of foundational decisions the build plan stands on. **Status note for the agent: these decisions are now SETTLED** (see the ✓ DECIDED markers and the §7 ledger). The "▶ DECIDE" phrasing that remains in a few places reflects only the handful of minor tuning confirmations still open; treat everything marked ✓ DECIDED as final and build to it.
>
> **How to use it.** Read each section. Most decision points are now **settled** (marked **✓ DECIDED**); a few minor confirmations remain (marked **▶**). The one trust sub-point worth a final word is the platform-admin access gate in §4.3. See §7 for the full ledger.

---

## 1. Modularity — the core runs alone, modules plug in

### 1.1 Principle

The document-control engine is the **core**. Everything else — training/LMS, controlled-copy register, CAPA, deviation, audit-findings intake, periodic-review scheduling — is a **module**. The core must run correctly and completely with **zero modules connected**. A module being absent, turned off, or failing must never break a core flow; it can only remove an *optional capability*.

This is what makes the platform configurable per tenant: the platform admin board exposes each module as a switch, and turning a module off for a tenant simply means the core takes its default path past that seam.

### 1.2 The seam contract

A module connects to the core only through a **defined seam**. It never reads or writes the core's tables directly. There are two kinds of seam:

- **Trigger seams (inbound).** A module asks the core to start something. Example: a CAPA concludes "this SOP must change" and calls the core's "raise a change request" entry point. The core does not know or care that a CAPA raised it — it just receives a well-formed change request with references attached. Any number of modules can use a trigger seam identically.

- **Coupling seams (bidirectional).** The core reaches a point where it *can* defer to a module, and waits for an answer. Example: at the effective window, the core asks "is training required and, if so, is the threshold met?" If the training module is connected, it answers. If it is not connected, the core uses its **default resolution** (see §1.3).

### 1.3 Default resolution — the flow never breaks

Every coupling seam has a **defined default** the core uses when the module is off or absent. The default must be *safe* and must keep the flow moving:

| Seam | Module connected | Module OFF / absent — default |
|------|------------------|-------------------------------|
| Training (at effective window) | Module tracks completion, reports threshold | Core treats training as **not required** → document goes effective directly. (Training simply isn't a gate for this tenant.) |
| Controlled-copy register (at reconciliation) | Register lists copies; all must be accounted | Core treats reconciliation as **nothing to reconcile** → passes directly. (Paperless tenant.) |
| CAPA / deviation / findings (trigger seams) | Module can raise change requests | Core simply never receives triggers from them; users raise changes manually via intake. No flow affected. |
| Periodic review (scheduler) | Surfaces due/overdue, can auto-raise reviews | Core still stores next-review dates; they just aren't proactively surfaced. Manual review still possible. |

The principle: **a module off removes a capability, never a step's ability to complete.** The core always has a way forward.

### 1.4 What is NOT modular — the fixed core

Some things look like they could be modules but must **never** be switchable, because turning them off would make the system non-compliant. These are properties of the engine, hardwired:

- Segregation of duties (author ≠ approver, etc.)
- Atomic supersession (one effective version, ever)
- The retention time-gate before destruction
- The audit trail (every action logged — see §2)
- The state machine itself (no ad-hoc transitions)

**Configurable at the edges, fixed at the core.** The admin board switches *modules*; it can never switch off a *guard*.

### 1.5 The swap-test (how we know modularity is real)

A seam is only truly clean if we can replace its module with a stub and the core still runs. Build target: replace the training module with a stub that always answers "no training required," and the core must complete every flow correctly. If it can't, the seam is leaking — the core is secretly depending on the module. This test is the acceptance criterion for modularity.

### 1.6 Admin board as the switchboard

The platform admin board (see §4) shows, per tenant, every module and its on/off state. Turning a module on/off:
- Takes effect for new flows immediately.
- **✓ DECIDED (recommendation accepted):** When a module is turned off mid-flight, **in-flight flows that already engaged the module continue under the old setting until they close**; the new setting applies only to flows that start after the switch. A module is never yanked out from under a running flow.

### 1.7 Open questions for this section

- **✓ DECIDED:** The trigger-seam modules (CAPA, deviation, findings) are **not** in the first core build. We build the core with the trigger seam **exposed but no modules attached**, ship with manual intake only, and attach those modules in a later phase. The seam's existence is what matters now — its presence is what lets those modules slot in later without touching the core.
- **✓ DECIDED (recommendation accepted):** Modules have per-tenant configuration beyond on/off (training threshold %, retention periods, etc.), and that config lives on the admin board as part of the switchboard. The *core guards* those values feed remain fixed and non-switchable.

---

## 2. Audit trail — compulsory, total, immutable

### 2.1 Principle

**Nothing escapes the audit trail.** Every activity in the system — every state transition, every field edit, every login, every read of a controlled document where read-tracking is required, every signature, every waiver, every override, every module connect/disconnect, every config change, every user invite and role change — writes an audit entry. There is no action in the system that is not auditable. This is not a feature of the document-control core; it is a platform substrate that *every* module and the core alike write to.

### 2.2 What is captured

Every entry captures, at minimum:
- **Who** — the authenticated actor (user id; never a shared/anonymous account for controlled actions).
- **What** — the action or transition, named precisely.
- **When** — a server-generated timestamp at the moment of action (contemporaneous; never client-supplied).
- **Where** — tenant, organization, department context, and the screen/endpoint the action came from.
- **On what** — the entity type and id the action touched.
- **Old value / new value** — for any state or field change.
- **Why** — a reason, required for any discretionary action (waiver, override, rejection, type dispute, destruction).
- **Metadata** — session, request id, and any relevant context to reconstruct the action.

> "It catches all metadata and actions related" — the entry is rich enough that, reading it alone, you can reconstruct exactly what happened, who did it, in what context, and (for discretionary acts) why.

### 2.3 Immutability and robustness

- **Append-only.** No updates, no deletes, ever, by anyone — including platform admins. Enforced at the database privilege level (no UPDATE/DELETE grants on the audit store) and ideally reinforced by a trigger that rejects modification attempts.
- **Tamper-evident.** **✓ DECIDED (recommendation accepted):** The audit store uses **cryptographic chaining** — each entry hashes the previous, so any alteration is detectable — built in **from day one**. It's cheap insurance and inspectors increasingly expect it; retrofitting a hash chain onto existing data is awkward, so we do it at the start.
- **Enduring.** Audit data survives for the full retention period of whatever it describes, and beyond. It is never purged with the records it documents — when a document is destroyed, its audit history remains.

### 2.4 Displayed and sortable

The audit trail is not just stored — it is **surfaced**:
- A read-only audit viewer that displays entries.
- **Sortable and filterable** by who, what, when, entity, tenant, org, department, action type.
- Exportable (read-only export for inspectors).
- **✓ DECIDED:** Audit **viewing** is access-controlled (the audit *captures* everything; *seeing* it is scoped). Org-level QA sees their own org's audit trail. Platform admins do **not** see org-level audit by default — they reach it only through the gated, logged break-glass path (§4.3). The org additionally sees, in its own audit trail, every instance of platform-admin access.

### 2.5 Audit is a platform substrate, not a core feature

Because every module must write to it, the audit trail is built **first** and lives **below** both core and modules. The contract is: no code path anywhere in the system performs a controlled action without writing an audit entry. A module that doesn't write audit entries is not connectable. This is the one rule with no exceptions.

### 2.6 Decisions for this section

- **✓ DECIDED (recommendation accepted):** Read-tracking is a **per-tenant setting**, but the *capability* exists from the start. Tenants that need "trained users accessed the current version" turn it on; others keep audit volume lower.
- **✓ DECIDED:** Cryptographic chaining built in **from day one** (§2.3).
- **✓ DECIDED (recommendation accepted):** The audit trail **outlives the longest document retention period** and has its own retention floor; it is never purged with the records it documents.

---

## 3. Multi-tenancy and organization — built in from line one

### 3.1 Principle

Tenancy is **not** something added later — it is in the data model and the access model from the very first table. Every controlled entity belongs to a tenant, and within a tenant to an organization structure. Retrofitting tenancy is one of the most painful migrations possible, so it is foundational.

### 3.2 The hierarchy

We need to settle the exact shape, but the working model is:

```
Platform
  └─ Tenant            (a customer of the platform; e.g. the auto-center company)
       └─ Organization (the company entity; 1:1 with tenant today, modelled separately)
            └─ Department  (QA, Operations, etc.; QA is the default — see §5)
```

> A **branch / site** level (between Organization and Department) is intentionally *omitted* now — single-site only — but the model is shaped so it can be inserted later without a painful migration if a client ever goes multi-site.

- **✓ DECIDED:** Tenant and organization are modelled as **separate levels** even though they are 1:1 in practice today. Collapsing two levels later is trivial; splitting one level later is a brutal migration — so we keep them distinct from the start for safety, while treating them as 1:1 operationally.
- **✓ DECIDED:** **Single-site only.** There is no branch level. The hierarchy is **Platform → Tenant → Organization → Department**, with QA as the default department. The department layer is structured so that a **branch level could be inserted later** (between Organization and Department) without a painful migration, should a client ever go multi-site — but we do **not** build a dormant branch level now. This also settles QA scoping: with single-site, QA authority is simply **org-wide** (no branch-scoping question exists).

### 3.3 Isolation

- **Hard tenant isolation.** No tenant can ever see, query, or affect another tenant's data. **✓ DECIDED (recommendation accepted):** isolation is **row-level security (RLS) keyed on tenant** on a shared schema — the standard, scalable choice that fits Supabase/Postgres well. (If a future client contractually demands physical separation, that's a per-client escalation, not the default.)
- **Every table carries tenant context.** tenant_id (and org/department where relevant) is on every controlled row, set at creation, never null, never changeable.

### 3.4 Scoping flows to the hierarchy

- A document belongs to a department within an org within a tenant.
- A HOD endorses within their department.
- QA authority is **org-wide** (single-site; no branch-scoping). QA is the default department and root authority (see §5).
- The audit trail records the full hierarchy context on every entry (§2.2).

### 3.5 Decisions for this section

- **✓ DECIDED:** Tenant↔org modelled as separate 1:1 levels (§3.2).
- **✓ DECIDED:** Single-site — no branch level; org-wide QA (§3.2).
- **✓ DECIDED:** Isolation = RLS on shared schema (§3.3); physical separation only as a per-client escalation.
- **✓ DECIDED:** **No cross-tenant users.** A user belongs to exactly **one** tenant. Identity is created by invitation bound to that single tenant; there is no consultant-style multi-tenant account. This simplifies identity, auth, and isolation.

---

## 4. Platform-level governance

### 4.1 Principle

There are **two distinct governance planes**, and conflating them is a fundamental error we want to avoid from the start:

- **Platform governance** — runs the *platform itself*, across all tenants. This is you / the platform operator.
- **Organization governance** — runs *within a single tenant/org*. This is the client's QA and the roles they provision.

These are separate role systems. A platform admin is **not** automatically an org admin, and an org's QA has **no** platform powers. Keeping them distinct prevents the most dangerous confusion in a multi-tenant compliance system.

### 4.2 What platform governance controls

- **Provisioning tenants.** Creating a new tenant/org on the platform.
- **The module switchboard.** Turning modules on/off per tenant, and setting module-level config (§1.6, §1.7).
- **Platform-wide configuration** that isn't a tenant's to set.
- **Cross-tenant oversight** — viewing platform-level audit (who provisioned what), system health, etc.
- **Inviting the first org user** — specifically, the initial QA (see §5.3 and §6).

### 4.3 Platform admin access to tenant data — gated break-glass under NDA

**✓ DECIDED.** The platform admin operates under an **NDA with the organization**, so they *may* see tenant data — but **never by default**. Access is gated:

- **Default state: no visibility.** A platform admin cannot see a tenant's controlled documents or org-level audit trail in the normal course. The data is not shown.
- **Request-to-view gate.** To see tenant data, the admin must pass through an explicit **request-access gate** — a deliberate action, not an ambient permission. Access is granted for a bounded purpose/session, not permanently.
- **Everything is logged.** The access request itself is logged, *and* everything the admin does while access is open is logged — what they viewed, when, for how long. The org can see, in the audit trail, every instance of platform-admin access and what occurred during it.
- **The NDA is the trust basis.** Unlike a strict no-access model, this relies on the contractual NDA plus total logging for accountability, rather than technical impossibility of access.

> **▶ ONE SUB-POINT TO CONFIRM:** When the admin requests access through the gate, is it **self-authorized** (admin opens the gate themselves; the org sees it in the log afterward — *notification-based*) or **org-approved** (the org's QA must grant the request before the gate opens — *consent-based*)? This is written as **self-authorized-but-fully-logged** for now, matching "a gate where they request access," but it's the one trust posture worth a final confirmation. Consent-based is stricter; notification-based is faster for support. We can also make it **per-tenant configurable** (some clients demand consent, others accept notification).

- Platform governance never approves, signs, or participates in a tenant's quality workflows. It runs the platform, not the client's quality system — even when access is open, the admin views, never acts in the quality flow.

### 4.4 Platform admins are invited and owner-scoped

**✓ DECIDED.** The platform plane mirrors the org plane's structure:

- The **platform owner** is the root authority of the platform plane (as QA is the root of an org plane).
- The owner can **invite** additional platform admins.
- The owner **controls each invited admin's scope** — what they can see and what they can do — so platform-admin access is itself least-privilege and granular, not all-or-nothing. One admin might manage the module switchboard but never pass the data-access gate; another might handle support access; etc.
- Every platform-admin invitation, scope grant, and scope change is logged.

### 4.5 Decisions for this section

- **✓ DECIDED:** Gated, logged, NDA-based break-glass access (§4.3) — with the self-authorize-vs-consent sub-point flagged for final confirmation.
- **✓ DECIDED:** Multiple platform admins, invited and owner-scoped, with granular per-admin scope (§4.4).

---

## 5. Organization-level governance — QA is first and default

### 5.1 Principle

Within a tenant, governance is owned by the organization itself, and **QA is the root of that governance.** When a tenant is provisioned, **QA is the first and default department**, and **every other department, role, and user is provisioned by QA** (or by people QA authorizes). QA is the seed from which the org's structure grows.

### 5.2 Why QA is special

In a GxP environment QA is the release authority and the owner of the quality system. Making QA the provisioning root mirrors reality: the quality function stands up the document-control system, defines departments, and grants roles. It also means there is always a defined, accountable owner of the org's structure — never an ambiguous "who set this up?"

### 5.3 Provisioning chain

```
Platform admin provisions a tenant
   → and invites the tenant's first user: the initial QA
        → QA creates departments (QA already exists as the default)
        → QA invites users and assigns roles (HOD, author, signatory, trainer, viewer)
        → HODs are assigned to departments by QA
        → users operate within the roles QA granted
```

- The **initial QA** is the only user that comes from *outside* the org (invited by the platform). Everyone else is invited from *inside* by QA or QA-authorized roles.
- **✓ DECIDED (recommendation accepted):** QA can delegate user-provisioning to an **org admin** capability (so QA isn't stuck doing pure IT admin forever), but **role-granting for quality-critical roles (QA, approver, signatory) stays with QA**. The IT-style work can be delegated; the quality-authority grants cannot.

### 5.4 Org roles are distinct and well-scoped

The org-level roles (from the spec: Author, HOD, QA/Approver, Signatory, Trainer, Admin, Viewer) are **scoped to the org hierarchy** — to departments. A HOD is a HOD *of a department*. QA authority is **org-wide**:

- **✓ DECIDED:** With single-site (no branches), **QA authority is org-wide** — one QA function is the release authority for the whole organization. There is no branch-scoping to configure. (If a branch level is ever added, this is the point that would need revisiting.)

### 5.5 Separation from platform governance

An org's QA — even as the org's root authority — has **zero platform powers**. They cannot provision other tenants, cannot touch the module switchboard (they *consume* the modules the platform enabled for them), cannot see other tenants. The org governance plane is sealed inside the tenant.

- **✓ DECIDED (recommendation accepted):** An org can **see which modules are available to them, read-only**, with a "request a change" path to the platform. They stay informed without holding the switch.

### 5.6 Decisions for this section

- **✓ DECIDED:** QA-delegable user-provisioning; quality-role-granting stays with QA (§5.3).
- **✓ DECIDED:** QA authority org-wide (single-site) (§5.4).
- **✓ DECIDED:** Org has read-only visibility into its module switchboard with a request path (§5.5).

---

## 6. Users are invited, never self-signed-up

### 6.1 Principle

**No one self-registers.** There is no public sign-up. Every user enters the platform by **invitation**:
- The platform invites a tenant's initial QA.
- QA (and QA-authorized roles) invite everyone else into the org.

This is a hard rule — it's how a controlled system guarantees that every account is accountable to someone and tied to a real, authorized identity. An uninvited account cannot exist.

### 6.2 How invitation works

- An authorized inviter (platform admin for the seed QA; QA/org-admin for others) creates an invitation tied to an email and an intended role/scope.
- The invitee receives a one-time, expiring invitation.
- On acceptance, the invitee authenticates (Google sign-in, §6.3) and their account is created **already bound** to the correct tenant, org, department, and role.
- The invitation, acceptance, and initial role grant are all audited (§2).

### 6.3 Auth model — Google sign-in + mandatory, non-annoying MFA

**✓ DECIDED.**

- **Identity is Google sign-in (SSO).** Users authenticate with Google rather than passwords. This fits invite-only well: the invitation binds an email, and the user signs in with that Google identity.
- **MFA is mandatory** — enforced for every user, not optional.
- **But MFA must not be annoying.** The implementation uses **trusted-device remembering**: once a user passes MFA on a device, that device is remembered so the user isn't re-challenged on every login. Re-challenge happens on a sensible cadence (e.g. a new device, a new location, or after a defined interval), not constantly. Google's own session strength carries much of this, so a returning user on a known device has a near-frictionless sign-in while the system still satisfies "MFA enforced."
- **▶ MINOR CONFIRM:** the exact re-challenge cadence/interval (e.g. 30 days, new-device-only) is a tuning detail to set during build, not a fundamental — the principle (enforced but device-remembered) is what's fixed.

### 6.4 Deactivation, not deletion

**✓ DECIDED (recommendation accepted):** When a user leaves, they are **deactivated, never deleted** — their audit history and signatures remain attributable forever. A deactivated user cannot act, but every past action stays attributed to them.

- **▶ MINOR CONFIRM:** the rule for a departing user's **in-flight tasks** — reassign to another holder of the role, or block until reassigned. Recommendation: on deactivation, surface that user's open tasks for QA/org-admin to reassign, so nothing is silently stranded. (A tuning detail, not a fundamental.)

### 6.5 Decisions for this section

- **✓ DECIDED:** Google sign-in + mandatory MFA with trusted-device remembering (§6.3).
- **✓ DECIDED:** Deactivate-not-delete; in-flight tasks reassigned on deactivation (§6.4).

---

## 7. Summary — decisions ledger

Almost everything is now settled (✓). Only a few minor confirmations and one genuine open item remain. The build plan can be written on this basis.

### 7.1 Settled (✓)

**Modularity**
1. ✓ Module switched off mid-flight → in-flight flows continue under old setting; new setting applies only to flows starting after the switch.
2. ✓ Trigger-seam modules (CAPA/deviation/findings) are **not** in the first build — the seam is exposed, modules attach later; ship with manual intake.
3. ✓ Module config (thresholds, retention) lives on the admin switchboard; the core guards it feeds stay fixed.

**Audit**
4. ✓ Read-tracking is a per-tenant setting; capability exists from the start.
5. ✓ Cryptographic chaining built in from day one.
6. ✓ Audit trail outlives the longest document retention; never purged with the records it documents.
7. ✓ Audit viewing is access-controlled: org QA sees their org; platform admins only via gated break-glass; org sees every admin-access event in its log.

**Tenancy**
8. ✓ Tenant and org modelled as separate 1:1 levels.
9. ✓ Single-site — no branch level; hierarchy is Platform → Tenant → Org → Department; QA org-wide. Branch insertable later if ever needed.
10. ✓ Isolation = row-level security on shared schema (physical separation only as a per-client escalation).
11. ✓ No cross-tenant users — a user belongs to exactly one tenant.

**Platform governance**
12. ✓ Platform admin access to tenant data = **gated, logged, NDA-based break-glass**. No default visibility; explicit request gate; all access and actions logged; org sees the access in its audit.
13. ✓ Platform admins are invited by the owner and individually scoped (granular per-admin permissions); owner is the platform-plane root.

**Org governance**
14. ✓ QA can delegate user-provisioning (org-admin capability); granting quality-critical roles (QA, approver, signatory) stays with QA.
15. ✓ QA authority is org-wide (single-site).
16. ✓ Org has read-only visibility into its module switchboard with a request-a-change path.

**Users**
17. ✓ Google sign-in (SSO) + mandatory MFA, made non-annoying via trusted-device remembering.
18. ✓ Deactivate-not-delete; departing user's in-flight tasks surfaced for reassignment.

### 7.2 Remaining to confirm (minor)

- **▶ ONE TRUST SUB-POINT (§4.3):** platform-admin access gate — **self-authorized + logged** (notification-based, written as the current default) vs **org-approved** (consent-based) vs **per-tenant configurable**. The only sub-decision with a real trust posture attached; everything else about the gate is settled.
- **▶ MINOR TUNING (§6.3):** MFA re-challenge cadence (e.g. 30 days / new-device-only) — a build-time tuning value, principle already fixed.
- **▶ MINOR TUNING (§6.4):** exact in-flight-task reassignment mechanics on deactivation — recommendation already given (surface for QA/org-admin reassignment).

---

*This is the foundation. With the above settled, the build plan can be written on solid ground — and we won't be fixing fundamentals mid-build. The single trust sub-point in §4.3 is worth a final word before the build plan locks the access model.*
