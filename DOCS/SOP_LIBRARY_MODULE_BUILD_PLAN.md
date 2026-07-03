# SOP Library Module — Build Plan

> **What this is.** The build plan for the SOP Library module — the browsing experience that wraps the core read surface. It plugs onto the document-control core, consumes the core read surface (never the version store directly), and is configurable/restyleable per tenant. This plan is for the implementation agent and assumes the core (version store + read surface) has passed verification.
>
> **The one governing distinction (read first):** the **read surface is CORE, never off**; the **library experience is this MODULE, configurable and pluggable.** If this module is switched off, the core read surface still serves effective documents through a plain fallback — reading never breaks. This module makes reading *pleasant and organized*; it never *owns* the ability to read.

---

## 1. Core concept

The library is the **experience layer over the core read surface**. The core already answers "give me the current effective version of document X, read-only." The library wraps that with: a browsable, searchable, categorized, styled way to *find* documents, a department-scoped working view for daily use, and a tenant-wide Master Index for cross-department reference.

**What it is:** a configurable shell — browse, search, categorize, favorite, style, organize.
**What it is not:** a source of truth. It holds no authoritative document data. It reads through the core read surface only. Turn it off and the core still serves documents.

**Why the split matters:** you can restyle and reorganize the library per company, adapt it to a firm transitioning to the eQMS, even disable it — and never endanger the ability to read an effective SOP, because that lives in core below this module.

---

## 2. The two views (settled model)

| View | Scope | Purpose |
|---|---|---|
| **Working view** (department-scoped) | Filtered to the user's department by default | Daily use — "my department's SOPs first." An **organizing convenience, not a security wall.** |
| **Master Index** (tenant-wide) | All effective SOPs across the whole tenant | Cross-department reference and info-gathering. Opened by a **"Master Index" button**. |

### 2.1 The scoping decision (settled — internalize this)

- **Effective document *content* is readable tenant-wide.** Any user can open and read any effective SOP company-wide via the Master Index. This is a deliberate choice for cross-referencing.
- **Therefore department scoping is an *organizing* convention for effective documents — NOT a read-security boundary.** The working view is a default filter; the Master Index reaches everything.
- **Where scoping still bites as real security:** in-flight work (drafts, in-review documents) is visible only to those party to it, and *actions* (endorse, approve) remain role/department-bound. Those are enforced by the core, not relaxed here.
- **Net:** effective reading is tenant-wide; in-flight visibility and doing are scoped. **Do not build department-level read-security on effective documents — by design it does not exist.**

### 2.2 Master Index access — fixed vs configurable

- For the current client: **full company-wide read** from the Master Index (settled).
- **Build it as a per-tenant configuration** defaulting to full read, with the alternative mode **"see-it-exists / request-to-read"** available for future tenants who want tighter cross-department control. *(This costs little now and avoids a painful retrofit when a stricter client arrives. The current client runs on the full-read default.)*
- In "see-it-exists" mode: the Master Index lists the entry (number, title, department, effective date) but opening content outside the user's scope requires a request. **This mode is the configurable option; full-read is the default.**

---

## 3. What the library shows (and never shows)

- Shows **only effective versions.** The library and Master Index never list drafts or in-review documents. (Those live in the workflow surfaces / My Tasks, not here.)
- Opens documents via the **core read surface** (the MS-online faithful viewer for reading).
- Displays the **human SOP number** (from the Numbering module) as a primary, searchable label — but keys everything on the system id underneath.
- **Never edits.** The library is read/browse only; editing happens only in Word outside the system (per the platform principle).

---

## 4. Features

### 4.1 Browse & organize
- **Working view:** department-scoped default listing of effective SOPs; clean, fast, the everyday surface.
- **Categorization / taxonomy:** per-tenant-configurable categories (by process area, document type, whatever the company uses). Documents organized into these; the taxonomy is tenant config, not hardcoded.
- **Favorites / pinning:** a user can pin frequently-used SOPs for quick access.
- **Sorting:** by number, title, effective date, category, department.

### 4.2 Search
- Search across **SOP number, title, category, and metadata.** Fast and forgiving (partial matches on the human number especially, since that's how people refer to documents).
- Search respects the mode: in full-read mode, search returns anything tenant-wide and opens it; in see-it-exists mode, search shows out-of-scope entries but gates opening.

### 4.3 Master Index
- The **"Master Index" button** opens the tenant-wide, ordered, filterable list of **all effective SOPs.**
- **Filterable** by number, title, department, category, effective date.
- In full-read mode, any entry opens for full read (cross-department reference — the whole point).
- The reference/info-gathering surface — this is where someone in Production looks up a QC SOP they need to understand.

### 4.4 Document entry point
- Opening any item (from working view, search, or Master Index) routes to the **core read surface** (D-READ) — the faithful MS-online view, with the option to see version history (D-HISTORY).
- The library adds a frame around D-READ (breadcrumbs, category, favorite toggle, "back to index"); it does not replace or re-implement the reader.

### 4.5 Per-tenant styling
- The library shell adapts to the company's branding and structure (presentation-level): layout, category structure, naming. This is what lets a transitioning firm feel at home.
- Styling is configuration, never affecting document data or state.

---

## 5. Fallback (module off)

- If the Library module is disabled on the switchboard, users reach documents through the **core read surface directly** — a plain list / direct D-READ access. Browsing is degraded (no categories, no styled index) but **reading is fully intact.**
- This is the swap-test for this module: off → core read still works; on → the richer experience appears. No core change between the two.

---

## 6. Configurability (scoped — presentation vs enforcement)

**Configurable (per tenant):**
- Module on/off (switchboard).
- Master Index mode: full-read (default) vs see-it-exists/request-to-read.
- Categories / taxonomy.
- Styling, layout, branding of the library shell.
- Working-view organization and defaults.
- Favorites behavior.
- Numbering display (feeds from the Numbering module).

**Not configurable (enforcement):**
- That the library lists **only effective versions** (never in-flight).
- That reading **survives the module being off** (core fallback).
- That the library reads through the **core read surface** and holds no authoritative data.
- That in-flight visibility and actions remain scoped by the core (the library cannot expose a draft).
- That opening a document uses the core reader (no re-implemented/uncontrolled viewer).

---

## 7. Data model

The library is largely a **read/query layer** — it stores organization and preference data, not document content.

| Table | Key columns (beyond ids/tenancy/audit) |
|---|---|
| `library_categories` | tenant-configurable taxonomy: name, parent, order |
| `document_categories` | join: document_id ↔ category_id (which categories a document sits in) |
| `user_favorites` | user_id, document_id |
| `library_config` | per-tenant: master_index_mode (full_read / see_exists), styling/layout settings, working-view defaults |
| (reads) | effective documents come from the **core read surface / version store** — the library never duplicates them |

All tenant-scoped (RLS). Library actions that matter for audit (e.g. a request-to-read in see-it-exists mode) write to the audit spine; routine browsing/searching may be read-tracked per the tenant's read-tracking setting (from foundation), not force-audited.

---

## 8. Screens

- **L-LIBRARY — SOP Library (working view).** The department-scoped default browse experience; categories, search, favorites, per-tenant styling. Opens documents via the core reader.
- **L-MASTER-INDEX — Master Index.** The "Master Index" button opens this: tenant-wide, ordered, filterable list of all effective SOPs. Full-read (default) opens any entry; see-it-exists mode gates opening out-of-scope with a request.
- **L-SEARCH — Search results** (may be integrated into the above rather than separate). Cross-number/title/category/metadata search, mode-aware.
- **L-CONFIG — Library configuration** (org admin/QA). Manage categories/taxonomy, styling, working-view defaults, Master Index mode. Per-tenant.
- **(Opening any document routes to core D-READ / D-HISTORY.)**
- **(In see-it-exists mode) L-READ-REQUEST — request to read** an out-of-scope document; routes to the owner/QA; audited. *(Only relevant if a tenant uses that mode; not needed for the current client.)*

---

## 9. Build phases

**Phase L0 — Module scaffold + read-surface consumption.** Register the module on the switchboard; wire it to consume the core read surface; confirm it holds no authoritative document data. *Done when:* the module lists and opens effective documents purely via the core surface, and the swap-test passes (off → core fallback reading works; on → library appears; no core change).

**Phase L1 — Working view + document entry.** L-LIBRARY department-scoped listing of effective SOPs; opening routes to core D-READ. *Done when:* a user sees their department's effective SOPs and opens any into the faithful reader; in-flight documents never appear.

**Phase L2 — Master Index + full-read.** L-MASTER-INDEX tenant-wide filterable list; full-read mode (default) opens any effective SOP company-wide. *Done when:* a user opens and reads an effective SOP from another department via the Master Index; only effective versions listed.

**Phase L3 — Search, categories, favorites.** Search across number/title/category/metadata; per-tenant categories/taxonomy; favorites. *Done when:* search finds documents by human number and title; categories organize the library; users pin favorites; all mode-aware.

**Phase L4 — Configurability + Master Index mode.** L-CONFIG; styling/taxonomy/working-view config; the see-it-exists/request-to-read mode built (default remains full-read). *Done when:* a tenant can restyle, re-categorize, and switch Master Index mode; in see-it-exists mode, out-of-scope opening is gated by an audited request; presentation changes never affect document data or state.

**Acceptance walkthrough (module definition of done):** with the module on and full-read (default) — a Production user opens the Library, sees Production SOPs by default, searches for a QC SOP by its human number, opens it via the Master Index and reads it in the faithful viewer, pins it as a favorite; QA re-categorizes and restyles the library with no effect on any document; the module is then switched off and the same user still reaches and reads documents via the core fallback; switched back on, the experience returns — **no core change throughout, reading never broke, no in-flight document ever appeared, and the human numbers displayed/searched correctly over system-id identity.**

## 10. Open items (confirm/ratify)

- Confirm Master Index default = full company-wide read for this client (settled), with see-it-exists mode built as the configurable alternative for future tenants.
- Category taxonomy — client QA defines their structure.
- Library styling/branding — feeds from tenant branding (logo/name now; colors at onboarding, same as other modules).
- Whether favorites are per-user only or shareable at department level (recommend per-user for v1; department-shared is a post-adoption candidate).
- Read-tracking of library opens — per-tenant setting from foundation (on for tenants who need "trained users accessed current version" evidence).

*End of SOP Library module build plan.*
