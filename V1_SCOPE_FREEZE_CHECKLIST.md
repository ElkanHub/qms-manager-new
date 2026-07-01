# V1 Scope Freeze & Readiness Checklist

> **Purpose.** The hard boundary for v1 of the document-control platform. Two rules govern everything: (1) **full rigor on a narrow scope, never partial rigor on a wide scope** — guards ship at full strength or not at all; only workflow breadth and surface polish may be "basic." (2) **Engine-present, surface-deferred** — every deferred item keeps its states and guards in the engine from day one; only its workflow UI waits for post-adoption feedback.
>
> **How to use.** The agent builds only what is IN. Anything DEFERRED gets its data model + guards but no workflow surface. Nothing ships until every check in Part 3 passes. Checks are pass/fail — no "mostly."

---

## Part 1 — IN for v1 (full strength, no thinning)

**Compliance core (the spine):**
- [ ] Version store: system-generated immutable ids; human number as metadata only
- [ ] One-effective-version per document, enforced at the database
- [ ] Atomic supersession (successor→effective + predecessor→superseded, one transaction)
- [ ] Append-only, hash-chained audit trail; every controlled action writes through the single audit primitive
- [ ] SoD guards, server-side, from the one shared primitive: author ≠ approver; HOD ≠ submitter (with logged fallback); QA ≠ requester
- [ ] Document lock while a change is open (`locked_in_cc`); lock-conflict check queues a second change
- [ ] Read surface: effective-only, read-only rendition via MS online viewer; never the editable source; never in-flight versions
- [ ] Impact assessment as a hard gate (incomplete blocks submission — no override)
- [ ] Retention time-gate present in the engine (destruction impossible before expiry)

**Workflows (end to end):**
- [ ] Unified intake: infer type off *effective*-version existence; confirm-with-rationale; dispute→QA logged; abandoned-draft fork; type locked at dispatch
- [ ] New SOP pipe: draft → HOD endorse (employee) / direct (manager) → QA review → approve → training gate / scheduled / active rev 00; reject preserves draft + reason
- [ ] Change pipe: both fronts → impact gate → classification → lock → signatures (per matrix; waiver admin-only + reason + logged) → reconciliation (safe default) → training seam → effective (atomic supersession) → simple effectiveness confirm → closed
- [ ] Retirement pipe: request → pre-checks (references / open training / filings) → QA approve → retention hold (states only; no destruction UI needed yet)
- [ ] Training coupling seam with safe default (off = no training gate); when on, untrained users blocked from execution

**Client-facing surfaces (the four that earn love — polish these):**
- [ ] Library working view + **Master Index** (tenant-wide, filterable, full cross-department read) — fast
- [ ] Client's numbering format applied and displayed exactly as they write it
- [ ] QA review screen that makes QA's day easier (their judgment, ask them)
- [ ] Document opens in the viewer reliably, every Word variant they use

**Foundation (prerequisite, already planned):**
- [ ] Tenancy/RLS, invite-only Google SSO + MFA, roles, governance planes, switchboard — per foundation plan

## Part 2 — DEFERRED (engine-present, surface-deferred)

| Item | In engine v1 | Deferred surface | Why safe |
|---|---|---|---|
| Controlled-copy register | Seam + safe default (nothing to reconcile) | D-COPIES screen, register workflow | Client is M365/paperless-leaning |
| Destruction execution | States + time-gate | D-DESTRUCTION queue UI | Nothing reaches retention expiry for years |
| Effectiveness review (windowed) | State + independent-approver guard; simple confirm step | Scheduled review-window machinery | Guard holds; scheduling shaped by feedback |
| Periodic review | Next-review dates stored | Due/overdue queue, auto-raise | Manual review possible meanwhile |
| Classification matrix richness | Impact gate + simple minor/major matrix | Full matrix editor polish | Matrix is QA-owned data; will evolve anyway |
| Numbering config UI polish | Format applied correctly | Fancy format-builder | QA sets it once |
| CAPA / deviation / findings modules | Trigger seam exposed | The modules | Manual intake covers v1 |

**Forbidden in v1:** thinning any Part 1 guard; building any deferred surface "while we're at it"; any config switch that weakens enforcement.

## Part 3 — Definition of done (all must pass)

**Layer 1 — bedrock (substrate proofs):**
- [ ] **Tamper test:** modify an audit row in a test → chain verification reports a break at exactly that point; UPDATE/DELETE on audit fails at DB level for every role
- [ ] **Rename test:** change a document's human number and a department's name → zero broken references, version chain and audit intact
- [ ] **Isolation test:** tenant-A query with no app filter returns zero tenant-B rows (DB-enforced), across every tenant-scoped table
- [ ] **Chokepoint test:** every state change traced to the single transition engine; no scattered `UPDATE status` anywhere
- [ ] **Swap test:** training module stubbed off → full flow completes on safe default; module on → flow defers to it; no code change between
- [ ] **SoD test:** the one shared primitive blocks self-approval in new-SOP, change, and retirement alike

**Layer 2 — the lifecycle walkthrough (with the client's real documents):**
- [ ] Take **5 real client SOPs, in their real numbering**, and complete without any manual DB intervention:
  - [ ] Intake → draft → HOD endorse → QA approve → (one with training gate, one scheduled future date, one direct) → active rev 00
  - [ ] Revise one via change control: impact → classify → lock → sign → effective; old revision flips to superseded **atomically**; new revision opens from Master Index
  - [ ] Attempt a second change on the locked document → it queues/blocks
  - [ ] Reject one submission → draft + reason preserved
  - [ ] Retire one → pre-checks run → retention hold; destruction attempt before expiry fails
  - [ ] A user outside the owning department opens each effective SOP from the Master Index
- [ ] **Audit story test:** export the audit trail for one document's full journey → it reads as a complete, chronological, attributable story an FDA Ghana inspector could follow without explanation
- [ ] **Viewer test:** every Word format the client actually uses renders read-only correctly

**Layer 3 — feedback instrumentation (cheap now, vital later):**
- [ ] Screen-usage and flow-abandonment visible from existing audit data
- [ ] One in-app "flag this" path for QA feedback

**Ship rule:** all Layer 1 + Layer 2 boxes checked → v1 is solid; iterate from adoption feedback. Any unchecked box = the next work item, before anything new.
