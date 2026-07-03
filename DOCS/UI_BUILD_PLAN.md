# UI Build Plan — shadcn/ui Application Shell & Screen System

> **Purpose.** The definitive layout spec for the QMS Manager UI. The engine is done and
> guarded server-side; this document says exactly how every surface is laid out, which
> shadcn/ui components build it, and what groundwork ships now so branding (colors,
> logo, typography tweaks) can be dropped in later **by editing CSS variables only —
> never by touching component code**.
>
> **Two laws, mirroring the system's own:**
> 1. **The UI never carries authority.** Every guard lives in the database. Hiding a
>    button is ergonomics, not security; showing one to the wrong role must still fail
>    safely (server error surfaced in a toast). Never pre-compute a permission decision
>    client-side that the server doesn't re-make.
> 2. **One grammar everywhere.** One shell, one table pattern, one form pattern, one
>    status-badge taxonomy, one confirm-with-reason dialog. A QA person who learns one
>    queue has learned them all.

---

## 1. Design principles (GxP-shaped UX)

- **Status is the loudest thing on any screen.** Every document, version, change,
  retirement and intake row leads with its status badge. States are the product.
- **Reasons are first-class.** Any discretionary action (reject, dispute, waive,
  override, force, destroy) opens a dialog that *requires* a reason textarea before the
  confirm button enables. The dialog copy says where the reason lands: *"Recorded
  permanently on the audit trail, attributed to you."*
- **Progressive disclosure by state.** Workstations (change control, retirement) show
  only the actions valid *now*; everything else is visible but inert in a muted
  timeline. Never a dead-end: each terminal state links onward (e.g. effective →
  "Open in Master Index").
- **Read surface is sacred.** The document viewer is visibly read-only — no affordance
  that even hints at editing an effective document. The only path to modification is
  the "Request a change" button, which routes through intake.
- **Dense, calm tables.** Compliance users live in queues. Tables are compact
  (`text-sm`), sortable, filterable, keyboard-navigable, and never lose the user's
  filter state on action (server actions revalidate in place).
- **Everything explains itself.** Empty states say *why* ("No documents awaiting
  endorsement — submissions from employees in your department appear here").
  Module-off fallbacks say so in an `Alert`, exactly as the engine behaves.

---

## 2. Groundwork: theming, tokens, dark mode

### 2.1 shadcn/ui initialization

- Tailwind v3.4 is already in place. Run `npx shadcn@latest init` with:
  - style: **new-york**, base color: **neutral**, CSS variables: **yes**,
    `src/` dir: yes, RSC: yes, alias `@/components` / `@/lib/utils`.
- This rewrites `globals.css` with the token block and adds `tailwind.config.ts`
  extensions (`colors: { border: "hsl(var(--border))", … }`), `tailwindcss-animate`,
  and `cn()` in `src/lib/utils.ts`.

### 2.2 The token contract (brand lands here later, nowhere else)

`globals.css` holds **two layers** of CSS variables:

**Layer A — shadcn semantic tokens** (standard set, both modes):
`--background --foreground --card --card-foreground --popover --popover-foreground
--primary --primary-foreground --secondary --secondary-foreground --muted
--muted-foreground --accent --accent-foreground --destructive
--destructive-foreground --border --input --ring --radius
--chart-1 … --chart-5 --sidebar-background --sidebar-foreground --sidebar-primary
--sidebar-primary-foreground --sidebar-accent --sidebar-accent-foreground
--sidebar-border --sidebar-ring`

Ship with the neutral defaults now. **Branding later = replacing values in this block
only.** No component may hardcode a hex/neutral-* class for anything semantic.

**Layer B — QMS status tokens** (our extension, same file, both modes):

```css
:root {
  --status-draft: …;        /* neutral   */
  --status-review: …;       /* amber-ish: in_review, hod_review, qa_review, impact_pending, screening */
  --status-approved: …;     /* teal-ish: approved, endorsed, signatures_pending */
  --status-effective: …;    /* green-ish: effective, active, closed(done) */
  --status-blocked: …;      /* orange: locked_in_cc, queued, pending_training, clarification_requested, disputed */
  --status-scheduled: …;    /* blue: scheduled, pending_reconciliation, effectiveness_review */
  --status-terminal: …;     /* slate: superseded, retired, rejected, withdrawn */
  --status-retention: …;    /* purple: retained, pending_destruction */
  --status-destroyed: …;    /* red: destroyed, plus destructive intents */
}
```

Expose them in `tailwind.config.ts` (`colors.status.draft` → `hsl(var(--status-draft))`)
so badges use `bg-status-effective/15 text-status-effective` style utilities.
Placeholder hues ship now (muted, accessible in both modes); the branding pass tunes
them without touching any component.

### 2.3 Dark mode

- `next-themes`: `<ThemeProvider attribute="class" defaultTheme="system" enableSystem
  disableTransitionOnChange>` wrapping `<body>` in `src/app/layout.tsx`;
  `suppressHydrationWarning` on `<html>`.
- Tailwind `darkMode: ["class"]`.
- `ModeToggle` (shadcn `DropdownMenu`: Light / Dark / System) lives in the shell
  header, always visible, and on the sign-in screen.
- The document viewer iframe area stays **light-backed** in both modes (documents are
  paper); frame chrome follows the theme.

### 2.4 Typography & icons

- Font: **Inter** (or Geist) via `next/font`, variable, `font-sans` — set once on
  `<body>`. Tabular numerals (`tabular-nums`) on all table/number cells.
- Icons: **lucide-react** only. Fixed vocabulary so meaning is stable:
  `FileText` documents · `GitPullRequestArrow` changes · `Inbox` intake ·
  `ClipboardCheck` QA review · `Stamp` endorsement · `Archive` retirement/retention ·
  `Flame` destruction · `GraduationCap` training · `Copy` controlled copies ·
  `CalendarClock` periodic review · `ScrollText` audit · `Flag` feedback ·
  `Building2` org · `Server` platform · `ShieldCheck` integrity/verify ·
  `Hash` numbering · `Grid3x3` classification matrix.

### 2.5 Density & radius

- `--radius: 0.5rem`. Spacing rhythm: page padding `p-6` (mobile `p-4`), card padding
  `p-5`, section gap `space-y-6`. Tables `py-2.5` rows. One `max-w` per template:
  tables/queues `max-w-6xl`, workstations/detail `max-w-4xl`, focused forms `max-w-lg`.

---

## 3. Dependencies & component inventory

```bash
npm i next-themes sonner lucide-react @tanstack/react-table
npx shadcn@latest add button card badge input textarea select checkbox radio-group \
  label form dialog alert-dialog sheet dropdown-menu tooltip popover command \
  breadcrumb sidebar separator skeleton table tabs alert sonner avatar \
  scroll-area collapsible switch input-otp progress toggle-group pagination hover-card
```

**Prebuilt blocks to scaffold from (then adapt):**

| Block | Used for |
|---|---|
| `sidebar-07` (collapsible icon sidebar + header w/ breadcrumb slot) | The app shell |
| `login-03` | `/signin` |
| `dashboard-01` (stat cards row) | `/dashboard` layout reference |
| shadcn **Data Table** guide (TanStack) | `components/app/data-table.tsx` — the one table |

New app-level components (all in `src/components/app/`):

`app-sidebar.tsx` `app-header.tsx` `breadcrumbs.tsx` `command-menu.tsx`
`mode-toggle.tsx` `user-menu.tsx` `status-badge.tsx` `data-table.tsx`
`data-table-toolbar.tsx` `page-header.tsx` `section-card.tsx` `action-form.tsx`
(port of existing) `reason-dialog.tsx` `confirm-destructive-dialog.tsx`
`state-timeline.tsx` `empty-state.tsx` `module-off-alert.tsx` `copy-id.tsx`
`stat-card.tsx` `role-gate.tsx` (render-only convenience; **not** authority).

---

## 4. The application shell

Three shells, chosen by route group:

```
src/app/(auth)/…       → centered card shell (no sidebar): signin, mfa, invite/accept, onboarding, start
src/app/(org)/…        → org shell: everything tenant-facing
src/app/(platform)/…   → platform shell: /platform/** (visually distinct — see 4.4)
```

(Route *groups* only — URLs do not change. Moving files into groups is pure layout.)

### 4.1 Org shell layout

```
┌──────────┬──────────────────────────────────────────────────────────────┐
│          │  [☰] Breadcrumbs………………………………   [⌘K Search] [🌓] [Avatar ▾] │ ← header, h-14, sticky
│ Sidebar  ├──────────────────────────────────────────────────────────────┤
│ (collap- │                                                              │
│  sible   │   <page content>                                             │
│  to      │                                                              │
│  icons)  │                                                              │
└──────────┴──────────────────────────────────────────────────────────────┘
```

- `SidebarProvider` + `Sidebar collapsible="icon"` + `SidebarInset`. State persists via
  the shadcn cookie mechanism. Mobile: sidebar becomes a `Sheet` behind the trigger.
- Header (inside `SidebarInset`, `sticky top-0 z-40 border-b bg-background/95
  backdrop-blur`): `SidebarTrigger` · `Separator vertical` · `<Breadcrumbs/>` · spacer ·
  command-menu trigger (`Button variant="outline"` showing "Search… ⌘K") ·
  `<ModeToggle/>` · `<UserMenu/>`.

### 4.2 Org sidebar content (role-aware groups)

`SidebarHeader`: org/tenant name + product mark (brand slot), collapses to logomark.

| Group | Items (icon · route) | Visible to |
|---|---|---|
| — | Dashboard · `/dashboard` | all org users |
| **Work** | Start a request · `/intake` · New SOP / change / retirement — one door | all |
| | SOP Library · `/library` | all |
| | Master Index · `/library/master` | all |
| | Change controls · `/changes` | all (their own) / QA (all) |
| | Training · `/training` | all |
| **Queues** (with `SidebarMenuBadge` counts) | Endorsements · `/queues/endorse` | hod |
| | QA review · `/queues/qa-review` | qa |
| | Retirements · `/queues/retirements` | qa |
| | Destruction · `/queues/destruction` | qa |
| | Periodic review · `/periodic` | qa |
| | Controlled copies · `/copies` | qa |
| **Quality system** | Audit trail · `/audit` | all (RLS-scoped) |
| | Classification matrix · `/org/classify` | qa |
| | Numbering · `/org/numbering` | qa |
| | Retention & modules · `/org/modules` | qa, org_admin |
| **Administration** | Users & roles · `/org/users` | qa, org_admin |
| | Departments · `/org/departments` | qa, org_admin |
| | Invitations · `/org/invite` | qa, org_admin |
| **Footer** | Flag this · `/feedback` (always visible, `Flag` icon) | all |
| | Account · `/account` | all |

Role filtering uses `getMyRoles()` server-side in the layout; the sidebar is an RSC.
Queue badges come from the same RLS-scoped counts the dashboard uses (one shared
server helper, cached per request).

### 4.3 Command menu (⌘K)

`Command` in a `CommandDialog`, opened by ⌘K/Ctrl-K or the header button.
- Group "Go to": every nav item the user can see.
- Group "Documents": server-filtered search over effective documents
  (number + title) → `/documents/[id]`.
- Group "Actions": Start a request · Flag this · Export audit CSV · Toggle theme.

### 4.4 Platform shell

Same skeleton, **deliberately distinct** so operators always know which plane they're
on: sidebar uses the inverted sidebar tokens (dark in light mode), header shows a
`Badge variant="outline"` with "Platform plane". Nav: Tenants · Provision ·
Admins · Switchboard · Onboarding flows · Break-glass access · Gate config ·
Audit integrity. Scope-filtered exactly as `/platform/page.tsx` already does.

### 4.5 Auth shell

Centered `Card` (`max-w-sm`), product mark above, muted ambient background,
`ModeToggle` floating top-right. Used by `/signin`, `/mfa`, `/invite/accept`,
`/onboarding`, `/start`.

---

## 5. Breadcrumbs — the full map

`<Breadcrumbs/>` renders from a static route manifest (`src/components/app/nav.ts`,
single source shared by sidebar + breadcrumbs + command menu). Dynamic segments
resolve to human labels server-side (document number+title, CC id short-form).
Last crumb is `BreadcrumbPage`; long document titles truncate with `Tooltip` on hover.

| Route | Trail |
|---|---|
| `/dashboard` | Dashboard |
| `/intake` | Work ▸ Start a request |
| `/library` | Work ▸ SOP Library |
| `/library/master` | Work ▸ SOP Library ▸ Master Index |
| `/documents/[id]` | Work ▸ SOP Library ▸ {number · title} |
| `/documents/[id]/history` | … ▸ {number} ▸ Version history |
| `/documents/[id]/changes` | … ▸ {number} ▸ Changes |
| `/documents/[id]/draft` | … ▸ {number} ▸ Draft |
| `/documents/[id]/retire` | … ▸ {number} ▸ Retirement request |
| `/changes` | Work ▸ Change controls |
| `/changes/[id]` | Work ▸ Change controls ▸ CC-{short-id} |
| `/queues/endorse` | Queues ▸ Endorsements |
| `/queues/qa-review` | Queues ▸ QA review |
| `/queues/retirements` | Queues ▸ Retirements |
| `/queues/destruction` | Queues ▸ Destruction |
| `/periodic` | Queues ▸ Periodic review |
| `/copies` | Queues ▸ Controlled copies |
| `/training` | Work ▸ Training |
| `/audit` | Quality system ▸ Audit trail |
| `/feedback` | Flag this |
| `/org` | Administration |
| `/org/users` `/org/departments` `/org/invite` `/org/numbering` `/org/classify` `/org/modules` `/org/access-grants` | Administration ▸ {Users & roles / Departments / Invitations / Numbering / Classification matrix / Modules / Access grants} |
| `/account` | Account |
| `/platform` | Platform |
| `/platform/*` | Platform ▸ {Provision / Admins / Switchboard / Onboarding flows / Break-glass access / Gate config / Audit integrity} |

---

## 6. The shared grammar (build these once, use everywhere)

### 6.1 `StatusBadge`

One component: `<StatusBadge kind="version|document|change|retirement|intake|signature|training" value={status}/>`.
Internally a map from every engine status string → `{tone, label, icon?}` using the
Layer-B tokens. Unknown statuses render neutral with the raw string (never crash on a
new state). Tones per §2.2. Badges: `Badge` with `rounded-md`, dot-prefix variant in
tables, uppercase label in workstation headers.

### 6.2 `DataTable`

TanStack + shadcn `Table`. Props: columns, data, `searchKey`, faceted filters
(status, department, category), initial sort, `onRowHref` (whole-row link),
`emptyState`. Toolbar = `Input` (debounced, syncs to `searchParams` so server
components stay the data source) + facet `DropdownMenu`s + column-visibility menu +
right-aligned primary action slot. Footer = `Pagination` + count.
Row density `py-2.5`; first column is the identity cell (number mono + title medium);
status column always present and always a `StatusBadge`.

### 6.3 Forms & actions

- Keep server actions as the only mutation path. Port `ActionForm` to shadcn
  primitives: `Label` + `Input`/`Textarea`/`Select`, submit `Button` with pending
  spinner (`Loader2 animate-spin`), errors via `Alert variant="destructive"` inline
  **and** `sonner` toast; success via toast (and optional inline confirmation).
- `reason-dialog.tsx`: `Dialog` wrapping an ActionForm with a required reason
  `Textarea` (min 10 chars client-hint; server is the gate), footer note:
  *"Recorded permanently on the audit trail, attributed to you."* Used by: reject,
  request clarification, dispute intake, waive signature, force reconciliation,
  classification override, retirement justification.
- `confirm-destructive-dialog.tsx`: `AlertDialog` + reason + **type-to-confirm**
  (user must type the document number) — used only by Destroy. Shows the retention
  math ("Retention elapsed 2031-04-01 · 4 years ago").

### 6.4 Page & section furniture

- `PageHeader`: title (h1, `text-2xl font-semibold`), optional description, right-side
  action slot. Detail variant adds: overline (number/type), `StatusBadge`, meta line
  (revision · effective date · department), actions (`Button` + overflow
  `DropdownMenu`).
- `SectionCard`: `Card` with `CardHeader` (title `text-base`, optional description) —
  the unit of workstations and admin screens.
- `StateTimeline`: horizontal (desktop) / vertical (mobile) list of pipe stages with
  done/current/upcoming markers — the change pipe and retirement pipe spine.
- `EmptyState`: icon, one sentence of *why*, optional CTA.
- `ModuleOffAlert`: `Alert` with `Info` icon — standard copy for every seam fallback.
- Loading: every route gets `loading.tsx` with `Skeleton` matching its real layout
  (table rows for queues, card grid for dashboard). Errors: shared `error.tsx` with
  retry.
- `sonner` `<Toaster richColors position="top-right"/>` mounted once in the root
  layout.

---

## 7. Screen-by-screen specification

### 7.1 Auth & entry

**`/signin`** — from `login-03`: product mark, "Sign in with Google" (`Button` full
width, Google glyph), fine print: *invite-only; contact your QA admin*. No password UI.

**`/mfa`** — `Card` + `InputOTP` (6 slots), verify `Button`, resend link,
step indicator "Step 2 of 2".

**`/invite/accept`** — `Card` shows org name, invited email, role to be granted
(`Badge`); Accept button (existing action); expired/mismatch states as
`Alert variant="destructive"` with what to do next.

**`/onboarding`** — configured fields rendered as a single card form (existing logic)
with `Progress` if multi-step config; completion routes to `/dashboard`.

**`/start`, `/`** — resolver only: route to `/dashboard`, `/platform`, or `/signin`.
Skeleton splash while resolving.

### 7.2 `/dashboard`

- Row 1: five `StatCard`s (existing counts) — value `text-3xl tabular-nums`, label,
  icon, each a link; subtle `hover:border-ring`.
- Row 2 (QA/org-admin only — driven by `usage_summary` succeeding): "Flow completion"
  `SectionCard` (funnel pairs as labeled progress rows: started→dispatched etc., with
  `Progress` bars) + "Busiest screens" `SectionCard` (top-8 list, count right-aligned
  mono). Keep as lists now; chart tokens (`--chart-*`) are already reserved for a
  later sparkline pass.
- Header actions: "Audit trail →" `Button variant="outline"`, "Flag this"
  `Button variant="ghost"` with `Flag` icon.

### 7.3 `/intake` — the one door

Wizard as a single `Card max-w-lg`, three phases (existing `IntakeFlow` state machine),
with a 3-step header (`StateTimeline` compact: Describe ▸ Confirm ▸ Done):

1. **Describe**: reason `Textarea` (required), optional title `Input`, target documents
   multi-select (`Command` inside `Popover` — searchable multi-pick of effective docs,
   chosen ones as removable `Badge`s), "discontinue" `Checkbox`, content ref `Input`.
2. **Confirm**: inferred type as a prominent `Badge` + rationale copy (existing
   RATIONALE map) in an `Alert`; **abandoned-draft fork** if present: `RadioGroup` —
   "Resume the abandoned draft" / "Start fresh". Buttons: Confirm & dispatch
   (`Button`), Dispute (`Button variant="outline"` → `reason-dialog`; explains it
   routes to QA and is logged).
3. **Done / Disputed**: success `Alert` with link onward (document history / QA note).
   Type-locked note: *"Type locked at dispatch."*

### 7.4 `/library` and `/library/master`

- **Library**: `PageHeader` ("SOP Library", description "Your department's working
  view", action → Master Index `Button`). `ModuleOffAlert` when library module is off.
  `DataTable`: ★ favorite (ghost icon `Button`, `Star`/`StarOff`, optimistic), Number
  (mono), Title, Category (facet), Status badge. Row → `/documents/[id]`.
  Favorites float to a "Pinned" group on top when present.
- **Master Index**: same table, tenant-wide, plus Department column + facet, search
  across number/title. Description: *"Every effective document in the organization —
  cross-department read is by design."* Empty state explains effective-only.

### 7.5 `/documents/[id]` — the read surface

- Detail `PageHeader`: overline = number (mono) · overline-right = `StatusBadge`
  (document status); h1 = title; meta = "Revision 02 · effective 2026-05-01 ·
  {department}". Actions: **Request a change** (`Button` → `/intake` prefilled
  target), overflow menu: Version history · Audit story (CSV) · Retire… (role-gated
  display) · Copy document id.
- `Tabs`: **Document** (default) · **History** · **Changes**.
  - *Document*: viewer `Card` — toolbar strip (renderer name, `Badge
    variant="outline"` "Read-only rendition"), iframe/embed area `aspect-[8.5/11]
    max-h-[80vh] bg-white` in both themes, `Skeleton` while loading, failure state
    with "Retry" + "Flag this" shortcut.
  - *History* (`/documents/[id]/history` shares the tab shell): version `Table` —
    Rev (mono) · Status badge · Effective from/to · Created by · reason; current
    effective row highlighted (`bg-muted/50`).
  - *Changes* (`/documents/[id]/changes`): CCs touching this doc, `DataTable` mini.
- **`/documents/[id]/draft`**: draft workstation `max-w-lg` — fields (title, content
  ref, reason) as card form; primary **Submit for review**; timeline showing where
  submission goes next (HOD vs QA per role); reject-preserved note when returning.
- **`/documents/[id]/retire`**: existing form in `SectionCard` + an "What happens
  next" `StateTimeline` (Request ▸ QA pre-checks ▸ Approved ▸ Retention hold);
  justification via required `Textarea`.

### 7.6 `/changes` & `/changes/[id]` — the workstation

- **List**: `DataTable` — CC (short id, mono) · Type · Class (badge outline) ·
  Status badge · Documents (count with `HoverCard` listing numbers) · Requested by ·
  Age. Facets: status, class. QA sees all; others their own.
- **Workstation** (`/changes/[id]`): the flagship screen.
  - Detail `PageHeader`: overline "{type} · {classification}", h1 "Change control
    CC-{short}", reason as description, `StatusBadge` prominent.
  - **`StateTimeline`** across the top: Submitted ▸ Screening ▸ Impact ▸ Classified ▸
    Document work ▸ Signatures ▸ Reconciliation ▸ Effective ▸ Effectiveness review ▸
    Closed. Current stage highlighted; queued/clarification shown as amber detours.
  - Below, **exactly the sections valid for the current status render as
    `SectionCard`s** (existing conditional logic), rebuilt:
    - *Screening* (QA): Begin screening `Button`; Request clarification + Reject via
      `reason-dialog`.
    - *Impact assessment* (hard gate): 6 required fields in a 2-col grid — text
      `Input`s + `Switch`es for booleans; gate copy in `Alert`: "All six must be
      substantive — classification is blocked until complete." Proposed class preview
      `Badge` updates on save.
    - *Classify* (QA): `RadioGroup` minor/major/critical, matrix preview (required
      signatures for the pick, from classification matrix), override-reason field
      appears (required) when pick ≠ proposed.
    - *Approve for work*: button; on `queued` show `Alert` "Target locked under
      CC-{other} — this change is queued" with link.
    - *Document work*: table of target documents — number/title · needs-training
      `Badge` · reviewed `Check` · per-row "Review" (QA).
    - *Signatures*: `Table` — Role (badge) · Signatory · Signed at · state; open slots
      the caller can fill show **Sign** `Button` → `Dialog` with meaning `Input`
      ("approved", "endorsed"…) and the SoD note; **Waive** (org_admin only) via
      `reason-dialog`. Requester sees their own slots disabled with `Tooltip`:
      "Segregation of duties — the requester cannot sign."
    - *Reconciliation*: register summary (issued/reconciled counts); Reconcile
      `Button`; Force via `reason-dialog` (admin).
    - *Training / release*: seam state (`ModuleOffAlert` when off), threshold
      `Progress`, Release button when met.
    - *Effectiveness review → Close*: reviewer-independence note; Close via reason
      form.
  - Right rail (xl screens; stacks below on smaller): compact audit feed for this CC
    (last 10 `document_story`-style entries, timestamp + action + actor).

### 7.7 Queues (one template, four instances)

`PageHeader` + `DataTable` + row-expand `Sheet` (side="right") for details/actions —
so queue workers never lose list position.

- **`/queues/endorse`** (HOD): rows = submissions; sheet: title, author, reason,
  content ref link, **Endorse** / **Request changes** (reason). Fallback note when
  HOD = submitter (logged skip) surfaces as an `Alert` in the sheet.
- **`/queues/qa-review`** (QA): the screen QA lives in — sheet shows the draft
  metadata, SoD indicators (author, submitter — with "you" markers), decision buttons:
  **Approve** (then: training gate / scheduled date `Popover` calendar / immediate),
  **Reject** (reason; copy: "The draft and your reason are preserved for the author").
- **`/queues/retirements`** (QA): sheet renders `precheck_results` as a checklist
  (`Check`/`X` per key: effective exists · no open change · training closed · copies
  reconciled) instead of raw JSON; **Approve** disabled with tooltip until all pass;
  **Withdraw from use** on approved rows.
- **`/queues/destruction`** (QA): table shows retention elapsed/remaining
  (`Progress` + date, tabular); Destroy only via `confirm-destructive-dialog`
  (type-to-confirm + reason); time-gated rows show a `Lock` icon + tooltip with the
  unlock date. Empty state: "Nothing reaches retention expiry for years — this queue
  is expected to be empty."

### 7.8 `/training`, `/copies`, `/periodic`

- **Training**: two `Tabs` — "My training" (assignment cards: doc + status +
  **Mark complete**) and "Manage" (QA: assign form — document + user `Select`s;
  per-document threshold `Progress` with stragglers list).
- **Copies**: `DataTable` — Copy # · Document/version · Holder · Issued · Status badge ·
  Reconcile action (`reason`-light dialog choosing method). Issue form in a `Dialog`
  from the header action.
- **Periodic**: `DataTable` of active docs with next-review dates — Due date ·
  Overdue `Badge destructive` · Conclude (`Dialog`: outcome `RadioGroup` no_change /
  revise + reason; "revise" copy says a change control will be raised and links to it
  after).

### 7.9 `/audit` & `/feedback`

- **Audit**: filter bar (`Input` action contains · entity id `Input` · date range
  `Popover` calendar) + `DataTable`: Time (mono) · Actor · Action (mono, `code` style) ·
  Entity (type + short id, `CopyId`) · Reason (truncate + `Tooltip`). Header actions:
  **Export CSV** `DropdownMenu` — "Current filter" / "Document story…" (`Dialog` with
  document picker → `/audit/export?document=`). Old/new values behind row-expand
  `Collapsible` rendered as a compact JSON diff block.
- **Feedback**: existing form in the auth-card pattern (`max-w-lg`), context `Input`
  pre-filled from `?context=` (every screen's "Flag this" links pass their screen id);
  copy unchanged (lands on the audit trail, attributed).

### 7.10 Org administration

- **`/org`**: retire the mega-grid — it becomes a compact "Administration" landing:
  grouped `SectionCard`s (People · Quality configuration · System) with 2-line link
  rows; the sidebar now carries primary navigation.
- **`/org/users`**: `DataTable` — Name/email + `Avatar` · Department · Roles
  (badge list) · Status · Actions menu (grant/revoke role `Dialog` with SoD-boundary
  copy, deactivate via `reason-dialog`). Header: **Invite user** → `/org/invite`.
- **`/org/invite`**: card form — email, department `Select`, initial role `Select`
  (role descriptions inline); pending invitations table below (expiry, revoke).
- **`/org/departments`**: table + create `Dialog`; HOD assignment `Select` per row;
  default-QA row marked with `Badge outline` "org root".
- **`/org/numbering`** (QA): format editor with **live preview** (`Card` showing
  "Next: {rendered}") updating as the format fields change; legacy note `Alert`:
  "Existing numbers are never rewritten."
- **`/org/classify`** (QA): the matrix as an editable grid — rows minor/major/
  critical, columns = roles, `Checkbox` cells; default-set indicator; save per row
  with audit note.
- **`/org/modules`**: read-only module cards (`Switch` disabled + `Tooltip`
  "Platform-controlled — request a change") with per-module seam explanation and
  **Request change** → existing `request_module_change` flow (`reason-dialog`).
- **`/org/access-grants`**: table of break-glass requests targeting this org —
  status timeline per row, **Approve/Deny** where org approval is the mode.

### 7.11 Platform plane

- **`/platform`**: tenant `DataTable` (Name · Status badge · Created · row → detail
  actions) + the scope-filtered quick links as sidebar nav (shell already distinct).
- **Provision**: single card form; success shows the created tenant + next steps
  (`Alert` with invite-QA pointer).
- **Admins**: table + grant `Dialog` (scopes as `Checkbox` group).
- **Switchboard**: per-tenant module grid — `Switch`es (live, audited), in-flight
  snapshot policy note; confirm `Dialog` on disable ("Running flows keep their
  snapshot").
- **Onboarding flows**: flow editor list (existing actions) as `SectionCard`s with
  field chips.
- **Break-glass access** (`/platform/access`): request form (tenant `Select`, purpose
  required, mode) styled with visible weight — `Alert` "Every access is logged and
  visible to the tenant"; open sessions table with expiry countdown + close action.
- **Gate config**: per-tenant mode `RadioGroup` (org-approved / self-authorized) +
  audit copy.
- **Verify** (`/platform/verify`): integrity board — per-chain `Card`s: chain key,
  `ShieldCheck`/`ShieldX` state, broken_at pointer when failed, last verified; Run
  verification `Button` with progress state.

### 7.12 `/account`

Profile card (avatar, name, email, department, roles as badges), theme preference,
MFA status row (`Badge` enrolled), Sign out `Button variant="outline"`.
Sessions/devices table if `trusted_devices` is exposed.

---

## 8. Role → visibility matrix (render-time convenience only)

| Surface | employee/author | hod | qa | org_admin | platform |
|---|---|---|---|---|---|
| Dashboard, Library, Master Index, Document read, Intake, Training(self), Audit(own tenant), Feedback, Account | ✅ | ✅ | ✅ | ✅ | — |
| Endorsement queue | — | ✅ | — | — | — |
| QA review · Retirements · Destruction · Periodic · Copies · Numbering · Classify | — | — | ✅ | — | — |
| Users/Departments/Invite/Modules | — | — | ✅ | ✅ | — |
| Waive signature | — | — | — | ✅ | — |
| Usage section on dashboard | — | — | ✅ | ✅ | — |
| Platform shell | — | — | — | — | ✅ (scope-filtered) |

Every ✅ is *display*; the RPC re-checks. `role-gate.tsx` is sugar over
`getMyRoles()`, nothing more.

---

## 9. Accessibility, responsiveness, quality bar

- **A11y**: shadcn/Radix gives focus management; keep it — every dialog focus-trapped,
  every icon-button `aria-label`ed, table row-links are real `<a>`s, status badges
  never color-only (label text always present), contrast ≥ 4.5:1 in both modes
  (validate the Layer-B tokens in both themes), `prefers-reduced-motion` respected
  (tailwindcss-animate honors it; no custom always-on animation).
- **Keyboard**: ⌘K palette; `/` focuses table search; dialogs submit on ⌘Enter;
  visible `--ring` focus everywhere.
- **Responsive**: sidebar → sheet < `md`; workstation right-rail stacks < `xl`;
  tables allow horizontal scroll within the card rather than squashing; stat grid
  2-col < `sm`. The viewer keeps page aspect.
- **Performance**: RSC-first (only intake flow, command menu, theme toggle, tables'
  interactive layer are client components); `loading.tsx` everywhere; no layout shift
  from theme (class strategy, `disableTransitionOnChange`).

---

## 10. Build order (each phase independently shippable)

1. **Groundwork**: shadcn init, tokens (A+B), fonts, `next-themes`, `Toaster`,
   `cn()`; port `ActionForm` onto shadcn primitives (drop-in, all screens instantly
   inherit consistent form styling).
2. **Shell**: route groups, `sidebar-07` adaptation, header, breadcrumbs manifest,
   mode toggle, user menu, command menu (nav-only first), platform + auth shells.
3. **Grammar**: `StatusBadge` (complete status map), `DataTable` + toolbar,
   `PageHeader`/`SectionCard`/`EmptyState`/`ModuleOffAlert`, `reason-dialog`,
   `confirm-destructive-dialog`, `StateTimeline`, `loading.tsx`/`error.tsx` set.
4. **The four loved screens** (checklist Part 1): Library + Master Index tables,
   QA review queue (sheet pattern), document read surface (tabs + viewer chrome).
5. **Workstations & remaining queues**: changes list/workstation, endorse,
   retirements, destruction, periodic, copies, training, intake wizard polish.
6. **Admin & platform**: org admin set, platform set, account, audit filters +
   export dialog, dashboard usage polish.
7. **Sweep**: empty/error/loading audit of every route, keyboard pass, both-theme
   contrast pass, mobile pass.

**Definition of done per screen**: uses shell + grammar components only (no raw
`neutral-*` semantic colors, no bespoke table/form) · has loading + empty + error
states · breadcrumb + command-menu entry present · works in both themes at `sm` and
`xl` · every mutation gives toast feedback and reason-dialogs where discretionary.

---

## 11. Guardrails (what NOT to do)

- No client-side permission logic beyond hiding nav/actions the server already gates.
- No component may hardcode semantic colors — tokens only (branding pass depends on
  it).
- No second table/form/dialog pattern. If a screen "needs" one, extend the grammar
  component.
- Never render an editable affordance on the read surface; the draft editor exists
  only under `/documents/[id]/draft` for in-flight versions.
- Don't invent new status colors per screen — extend the Layer-B map once, centrally.
- Deferred-surface screens (`/copies`, `/queues/destruction`, `/periodic`) get the
  standard treatment but **no new capability** beyond what their RPCs already expose
  (scope freeze).
