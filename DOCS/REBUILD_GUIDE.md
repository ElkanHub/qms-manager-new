# Screen Rebuild Guide (internal — for the UI rebuild of UI_BUILD_PLAN.md)

You are rebuilding ONE existing screen to use the shared grammar components. The
engine/server actions are DONE and correct — **do not change data fetching or server
actions**. Only replace markup/styling. Keep the file a **server component** if it is
one today (no `"use client"` on pages that fetch data); push interactivity into small
client components or the grammar components.

## HARD RULES (do not violate)
1. **No new authority.** Keep every `requireOrgUser`/`requireUser`/`requirePlatformUser`
   guard and every server-action wiring exactly as-is. Role checks are display-only.
2. **Tokens only.** Never use `neutral-*`, `amber-*`, `red-*`, `green-*`, hex, etc.
   Use semantic classes: `text-muted-foreground`, `bg-card`, `border`, `text-foreground`,
   `bg-muted`, `text-destructive`. Status colors come ONLY from `<StatusBadge/>`.
3. **One grammar.** Use the components below. Do not invent a second table/form/dialog.
4. **Preserve behavior.** Same routes, same queries, same actions, same guards. If a page
   shows a module-off fallback, keep it (use `<ModuleOffAlert/>`).
5. Must pass `npx tsc --noEmit`. Do not add dependencies. Icons from `lucide-react` only.
6. Do NOT wrap the page in `<main>` twice — the (org)/(platform) layout already provides
   the frame. Use a root `<div className="mx-auto max-w-6xl space-y-6 p-2">` (tables/queues
   `max-w-6xl`, workstations/detail `max-w-4xl`, focused forms `max-w-lg`).

## Grammar components (all under `@/components/app/`)
- `PageHeader` — `{title, description?, actions?, overline?, status?, meta?}`. h1 + optional
  right action slot. Detail variant: `overline` (number/type), `status` (renders a badge),
  `meta` (revision · date · dept line).
- `SectionCard` — `{title?, description?, actions?, children, className?, contentClassName?}`.
  The unit of workstations/admin screens (a Card with compact header).
- `StatusBadge` — `{value, kind?, dot?}`. Maps every engine status → tone+label. Use `dot`
  in tables. Pass the raw engine status string as `value`.
- `DataTable` — `{columns, data, searchKey?, searchPlaceholder?, facets?, initialSort?,
  onRowHref?, emptyState?, toolbarAction?, pageSize?}`. `facets` = `[{columnId, title, options?}]`.
  Define columns in a sibling `columns.tsx` (`"use client"`) exporting `ColumnDef[]`.
- `EmptyState` — `{icon?, message, action?}`. Message must say *why* it's empty.
- `ModuleOffAlert` — `{module, detail?}`. Standard module-off fallback.
- `ReasonDialog` — `{trigger, title, description?, action, submitLabel?, reasonLabel?,
  reasonName?, minLength?, destructive?, hiddenFields?, children?}`. Client. For any
  discretionary action (reject/dispute/waive/override/force/retire). `action` is a server
  action `(FormData) => Promise<{ok:true,message?}|{ok:false,error}>`; reason lands on
  `reasonName` (default "reason"). Extra fields via `hiddenFields` (hidden inputs) or `children`.
- `ConfirmDestructiveDialog` — `{trigger, title?, confirmValue, retentionNote?, action,
  submitLabel?, hiddenFields?}`. Client. ONLY for Destroy: type-to-confirm + reason.
- `StateTimeline` — `{stages}` where stages = `[{label, state?}]`,
  state ∈ `done|current|upcoming|detour`. The change/retirement pipe spine.
- `CopyId` — `{value, label?, short?}`. Click-to-copy mono id.
- `StatCard` — `{label, value, href, icon?}`. Dashboard tile.
- `RoleGate` — async server component `{anyOf: string[], children}`. Renders children only
  if the user holds a role. Display-only.
- `ActionForm` (`@/app/_components/ActionForm`) — existing `{action, submitLabel, children}`.
  Already ported to shadcn. Use for simple inline forms; wrap fields in `Label`+`Input`/
  `Textarea`/`Select` from `@/components/ui/*`.

## shadcn primitives (under `@/components/ui/`)
button, card, badge, input, textarea, select, checkbox, radio-group, label, form, dialog,
alert-dialog, sheet, dropdown-menu, tooltip, popover, command, breadcrumb, separator,
skeleton, table, tabs, alert, avatar, scroll-area, collapsible, switch, input-otp, progress,
toggle-group, pagination, hover-card, sonner. Toasts via `import { toast } from "sonner"`.

## CANONICAL EXAMPLE — the DataTable list pattern
See `src/app/(org)/library/master/columns.tsx` and `.../master/page.tsx`. Copy this shape
for every list/queue: server page fetches → maps to plain rows → `<DataTable>`; a sibling
`columns.tsx` (`"use client"`) defines columns with an identity cell first (number mono +
title medium) and a `StatusBadge` status column. Facets use `filterFn: (row,id,value)=>value.includes(row.getValue(id))`.

## Definition of done (per screen, UI_BUILD_PLAN §10)
Uses shell + grammar only (no raw neutral-* / bespoke table/form) · has empty state with a
*why* · every mutation gives toast feedback · discretionary actions use ReasonDialog ·
tokens only so both themes work · tsc clean.
