# Copy Register Module — Build Plan

> **What this is.** The build plan for the Copy Register module — the platform's **single controlled exit point** for documents leaving the system as copies (paper or PDF). It plugs into the document-control core at **seam C (reconciliation)** and is owned exclusively by **QA**. This plan is for the implementation agent and assumes the core has passed verification.
>
> **The big idea — one door in, one door out.** The whole platform has exactly two controlled openings:
> - **IN:** documents enter *only* through the change request / intake. Nothing gets into the controlled state any other way.
> - **OUT:** documents leave as copies *only* through the Copy Register, and **only QA issues**. No department can print or export an SOP themselves.
>
> The Copy Register is that exit. It is not merely a tracking log — it is the **gate** through which every copy of a controlled document leaves the system, and the record of every copy that has ever left.

---

## 1. Core concept

**The problem (recap).** Everything inside the system is digital and self-correcting: revise a document and the read surface instantly serves the new version — no one can accidentally open the old one. But the moment a copy leaves the system — printed on paper, or exported as a PDF and emailed — it lives *outside* the database's control and can go stale without the system knowing. A superseded copy in the wild is invisible to the system and dangerous on the floor (a classic GMP inspection finding).

**The solution.** Make the system the *only* source of copies, and log every copy it issues. If a copy exists, the register knows: which document, which revision, what type, who requested it, who (QA) issued it, when, to whom/where, and in what format. A copy the register doesn't know about should not be able to exist, because there is no other way to get one out.

**Why QA owns it.** QA is the release authority everywhere in the system. Issuing a copy is a release of controlled information outside the system's walls — so it belongs to QA, consistent with every other release decision. Other departments *request*; QA *issues*. This is the same authority pattern as approvals.

---

## 2. Two settled nuances (confirm — plan is written on these)

1. **Every copy out is a register event — paper OR PDF.** A copy issued as a PDF and emailed is still a controlled document leaving the system, so it goes through the register exactly like a printed page. The **format (paper / PDF)** is an *attribute* of the issued copy, not a way to bypass the register. There is no "just export it" path outside the register.
2. **Anyone requests; only QA issues.** The *request* for a copy can come from any department (via their dashboard). The *issuance* is **QA-only**. QA is the sole issuer; everyone else is a requester. (This mirrors QA-as-release-authority throughout the platform.)

> If either nuance is wrong, stop and correct before building — they shape the whole module.

---

## 3. The three copy types (the heart of the module)

Every issued copy is one of three types, and **the type determines its behavior at reconciliation** — this distinction is the core of getting the module right.

| Type | Purpose | Maintained on revision? | Reconciliation behavior |
|---|---|---|---|
| **Controlled copy** | A working copy meant to stay current | Yes — the holder is expected to use the current version | **Must be reconciled** (returned or destroyed) when the document revises. **Blocks** the change from completing until accounted. |
| **Display copy** | Posted for display at a location (wall, station) | Yes — publicly visible, must never show a stale revision | **Must be reconciled** on revision — arguably the most important to pull, because it's the most visible. Blocks until accounted. |
| **Uncontrolled copy** | Reference / information only, valid only on its print date | No — recipient knows it may go stale | **Not reconciled.** The register still **records that it was issued**, so there is a documented trace that a stale copy may exist in the wild. Does not block a change. |

**Why the distinction matters:** the previous single-type model treated all copies as controlled. Reality has three intents. A copy sent to a regulator for information (uncontrolled) should not block your next revision; a copy posted on the production wall (display) absolutely must be pulled before that revision goes live. Encoding the type is what makes reconciliation behave correctly for each.

> Uncontrolled copies are typically watermarked/stamped "UNCONTROLLED — FOR INFORMATION ONLY — VALID ON DATE OF PRINTING" so the physical artifact itself signals its status. Controlled/display copies carry their copy number and revision.

---

## 4. The flow — request → issue → track → reconcile

```
1. REQUEST (any department, from their dashboard)
     Requester picks: document, purpose, copy TYPE (controlled/uncontrolled/display),
       format (paper/PDF), destination/holder/location, quantity
     → request goes to QA                                    [audited: who requested, when, why]

2. ISSUE (QA only)
     QA reviews the request → approves/declines (with reason)
     On approve: system generates the copy as a PDF rendition of the CURRENT EFFECTIVE version
       (never the editable source)
     Register entry created: copy number, doc + REVISION, type, format, holder/location,
       requested_by, issued_by (QA), issued_at
     Controlled/display copies: numbered + stamped with copy number + revision
     Uncontrolled copies: stamped "uncontrolled / valid on print date"
     → copy delivered (PDF sent, or printed by QA)           [audited: full issuance record]

3. TRACK (continuous)
     Register lists every live copy: which doc/rev, type, where, held by whom, status
     Controlled/display copies are "live" until returned/destroyed

4. RECONCILE (at document revision — seam C)
     When the document revises, the register lists every CONTROLLED + DISPLAY copy of the
       outgoing revision
     Each must be marked RETURNED or DESTROYED
     The change CANNOT go effective until all controlled + display copies are accounted for
       (forced-override available to authorized role, reason logged — fire/lost/site-closed)
     Uncontrolled copies: noted as "may be stale" — do NOT block                [all audited]
```

### 4.1 Copy states (per issued copy)

| State | Meaning |
|---|---|
| `requested` | Department raised a request; awaiting QA |
| `declined` | QA declined the request (reason logged) |
| `issued` | QA issued it; copy is live in the wild |
| `returned` | Physical copy returned to QA |
| `destroyed` | Copy destroyed (returned then destroyed, or destroyed in place) |
| `superseded_unreconciled` | Document revised but this controlled/display copy not yet accounted — the blocking state |
| `stale_uncontrolled` | An uncontrolled copy whose document has since revised (informational, non-blocking) |

---

## 5. The exit-chokepoint guarantee (the enforcement that makes this real)

This is the non-negotiable core: **there is no path for a controlled document to leave the system as a copy except through the register.**

- No department has a "print" or "export" button on a controlled document that bypasses the register. The read surface is **view-only**; it does not offer download/print of the source.
- The **only** way to obtain a paper or PDF copy is to request it → QA issues it → it's logged. Full stop.
- Every issued copy is a **PDF rendition of the effective version**, never the editable source (preserves the controlled-copy principle: what leaves is a locked snapshot, not an editable document).
- This makes the register **complete by construction**: if a copy exists, it's in the register, because there's no other way to have made one.

> This is the mirror of the "one door in" rule: just as documents can only *enter* controlled state through intake, they can only *leave* as copies through the register. Two chokepoints, both owned by QA authority, both fully audited.

---

## 6. Seam C contract (how this module talks to the core)

The core, at `pending_reconciliation` in the change pipe, asks the module:

- **`all_copies_accounted(document_version_id)`** → returns true only when every **controlled + display** copy of the outgoing version is `returned` or `destroyed`. Uncontrolled copies do not affect this answer.
- The module can flag **forced reconciliation** (authorized role, reason logged) to answer true despite an unaccounted copy (genuine exceptions).

**Safe default (module OFF):** the core treats reconciliation as "nothing to reconcile" and passes — the paperless-tenant default. The change pipe still completes. (This is why the module is deferrable: a tenant that issues no copies doesn't need it.)

Events the module emits: copy requested, issued, returned, destroyed, forced-reconciled. Events it listens for: version superseded (marks controlled/display copies `superseded_unreconciled`, uncontrolled as `stale_uncontrolled`).

---

## 7. Roles

| Role | Can do |
|---|---|
| **Requester** (any department user) | Raise a copy request from their dashboard; see status of their own requests; see copies held by their department |
| **QA (issuer)** | Review requests; issue/decline; generate the PDF rendition; manage the register; drive reconciliation; force-reconcile (with reason) |
| **Admin** | Force-reconcile as authorized; nothing bypasses the audit |

> Enforced server-side: only QA can move a copy to `issued`. A requester can never self-issue. Same SoD spirit as the rest of the platform.

---

## 8. Data model

| Table | Key columns (beyond ids/tenancy/audit) |
|---|---|
| `copy_requests` | document_id, requested_version_id, requester_id, department_id, purpose, requested_type (controlled/uncontrolled/display), requested_format (paper/pdf), destination/holder, quantity, state, decided_by, decided_at, decline_reason |
| `controlled_copies` | copy_number, document_version_id (the REVISION issued), type, format, holder/location, requested_by, **issued_by (QA)**, issued_at, state, returned_at, destroyed_at, reconciled_method, pdf_ref |
| (rendition) | reference to the generated PDF snapshot of the effective version issued |

All tenant-scoped (RLS); every state change audited via the spine. `controlled_copies` rows are never deleted (returned/destroyed are states; history is permanent).

---

## 9. Screens

- **C-REQUEST — Copy request** (any department, from their dashboard). Pick document, type, format, destination, quantity, purpose. Submit to QA. See own request status. **No print/export of the document itself here — only a request.**
- **C-QA-ISSUE — QA issuance console** (QA). Incoming copy requests; review; issue (generates the numbered PDF rendition, applies the correct stamp per type) or decline with reason.
- **C-REGISTER — The register** (QA). The master list of every issued copy: document, revision, type, format, holder/location, status. Filterable (by document, type, department, status). The living record of everything that has left the system.
- **C-RECONCILE — Reconciliation** (QA). At a document revision: the list of controlled + display copies of the outgoing revision, each to be marked returned/destroyed; blocks completion until accounted; force-override (reason). Uncontrolled copies shown as informational "may be stale." *(This is the seam-C surface; it complements the core's D-RECONCILE.)*
- **C-MY-COPIES — Department copies** (requester/HOD). Copies currently held by the user's department, their revisions, and whether any are now superseded (prompting return).

---

## 10. Configurability (scoped — presentation vs enforcement)

**Configurable (per tenant):** module on/off (switchboard — off = paperless default); which formats allowed (paper, PDF, or both); copy-numbering format for controlled/display copies; watermark/stamp text per type; whether uncontrolled copies are permitted at all (some tenants may forbid them).
**Not configurable (enforcement):** that copies leave ONLY through the register; that only QA issues; that issued copies are PDF renditions of the effective version, never the editable source; that controlled + display copies block reconciliation until accounted; that every issuance is audited; the seam-C contract.

---

## 11. Build phases

**Phase C0 — Data model + seam C wiring.** Tables; the `all_copies_accounted` seam answer; module on switchboard. *Done when:* swap-test passes (off → core "nothing to reconcile" passes; on → core defers to the register), and the version-superseded listener correctly flags controlled/display copies as `superseded_unreconciled` and uncontrolled as `stale_uncontrolled`.

**Phase C1 — The exit chokepoint.** Ensure no controlled document can leave as paper/PDF except via the register; the read surface offers no bypass print/export; PDF rendition generation of the effective version. *Done when:* there is provably no path to obtain a copy outside the register (inspection + test), and every issued copy is a locked PDF snapshot, never the source.

**Phase C2 — Request → issue flow.** C-REQUEST (any dept) → C-QA-ISSUE (QA only); the three types with correct stamping; decline path. *Done when:* a department can request but never self-issue; QA issues with full register entry; controlled/display copies numbered + stamped, uncontrolled stamped as such; all audited.

**Phase C3 — The register + tracking.** C-REGISTER, C-MY-COPIES; live status of every copy; filtering. *Done when:* the register shows every copy that has left, by document/revision/type/holder/status; a department sees its held copies and is prompted when one goes stale.

**Phase C4 — Reconciliation.** C-RECONCILE; controlled + display copies block until accounted; uncontrolled non-blocking but noted; force-override (reason, logged). *Done when:* a document revision cannot complete until every controlled + display copy of the outgoing revision is returned/destroyed (or force-overridden with reason); uncontrolled copies never block; the whole reconciliation is an audit-readable story.

**Acceptance walkthrough (module definition of done):** on a real document — a department requests a controlled copy + a display copy + an uncontrolled copy → QA issues all three as stamped PDFs, each in the register → the document is then revised → reconciliation lists the controlled + display copies and **blocks** the change until both are marked destroyed → the uncontrolled copy is shown as "may be stale" but does **not** block → the change goes effective → the register and audit trail tell the complete story: who requested each copy, who (QA) issued it, when, which revision, and how each was reconciled. A department attempting to print/export the document directly **has no such path**. **Nothing untracked.**

## 12. Open items (confirm/ratify)

- Confirm the two nuances in §2 (every copy = register event incl. PDF; anyone requests, only QA issues).
- Whether uncontrolled copies are permitted at all for this client (configurable; some QA regimes forbid them).
- Copy-numbering format and stamp wording per type — client QA ratifies.
- Whether display copies need periodic re-verification (some regimes require confirming posted copies are current on a schedule) — possible future enhancement.
- Retention of the register itself — permanent (never purged); confirm alignment with the audit-retention floor.

*End of copy register module build plan.*
