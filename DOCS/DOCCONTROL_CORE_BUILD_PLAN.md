# Document-Control Core — Build Plan

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
