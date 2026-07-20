# Animation opportunities

A walkthrough of the app pinpointing where motion would earn its keep — success
feedback, drawing attention to live work, and sparking interest in features.
This is a **menu to review**, not a build order. Each item lists *where*, *what*,
*why*, and rough *effort*. Nothing here is implemented yet.

## Guardrails (apply to everything below)

- **Respect `prefers-reduced-motion`.** Every effect degrades to an instant
  state change. Non-negotiable for a QA/GxP tool — some users need it, and a
  regulated audience distrusts a UI that feels gimmicky.
- **Motion carries meaning, never decoration for its own sake.** In a compliance
  app, an animation should confirm "your signature was recorded" or "new work
  arrived" — it should not make a destructive action feel playful.
- **Stay on the stack we have.** `tailwindcss-animate` + CSS keyframes in
  `globals.css` + `sonner` cover ~90% of this. Reach for a dependency only where
  noted (and only if we decide the moment is worth it).
- **Fast and cheap.** 150–250ms for feedback, ≤400ms for entrances. No layout
  thrash — animate `transform`/`opacity` only.

---

## 1. Success & confirmation

The app's success feedback today is a `sonner` toast + a line of green text
(`ActionForm`). Functional, but every success feels identical — signing a
document lands the same as saving a preference.

| # | Where | What | Why | Effort |
|---|-------|------|-----|--------|
| 1.1 | `src/app/_components/ActionForm.tsx` — the shared success surface | Animated check-draw on the inline success line (SVG stroke draw, ~300ms) | One change lifts *every* form success across org + platform | S |
| 1.2 | `src/components/app/signature-capture.tsx` — e-signature saved (GxP moment) | A deliberate check-seal animation on "Signature saved" — this is the app's most meaningful confirmation | Signing is the highest-trust action; the feedback should feel weighty and final | M |
| 1.3 | `src/app/(org)/training/learn/[id]/learn-client.tsx` — quiz `passed` → phase `"done"`, certificate issued | The one place a small **one-time celebration** (confetti burst / certificate scale-in) is genuinely earned | Passing training is a real milestone for the learner; rewards completion | M |
| 1.4 | `src/components/app/onboarding-wizard.tsx` — final step | Gentle completion flourish + progress-bar fill settle | First impression of the whole system; ends onboarding on a high note | S |
| 1.5 | `sonner` toasts globally | Success toasts get a check icon that pops in; error toasts a subtle shake | Differentiates outcome at a glance without reading | S |

> Recommendation: do **1.1** first (highest leverage, one file). Reserve confetti
> strictly for **1.3** and maybe **1.4** — if every success throws confetti, none
> of them mean anything.

---

## 2. Drawing attention (live data & new work)

The app already polls queue counts and "online now" live. When those numbers
change, nothing signals it — the user has to notice a different digit.

| # | Where | What | Why | Effort |
|---|-------|------|-----|--------|
| 2.1 | `src/components/app/app-sidebar.tsx` — `SidebarMenuBadge` queue counts (poll every 15s) | Bump/pulse the badge when its count *increases* (new work arrived) | Pulls a QA reviewer's eye to a queue that just gained an item — the core "there's work for you" signal | M |
| 2.2 | `src/app/(org)/dashboard/online-now.tsx` — live count | Roll/tween the number when it changes (the dot already pulses) | Makes "who's here now" feel alive rather than static | S |
| 2.3 | `src/app/(org)/dashboard/status-strip.tsx` — the "Overdue for review" alert cell | Slow, low-key pulse on the alert color *only when count > 0* | Overdue reviews are a compliance risk; a resting-but-present signal beats a static red number | S |
| 2.4 | `src/components/app/pulse-sidebar.tsx` — broadcasts/messages arrival | Slide-in + brief highlight on a new message/broadcast | New comms are easy to miss in a side rail; entrance motion earns the glance | M |
| 2.5 | Queue/approval tables (`reason-dialog` + `ActionForm` actions, e.g. `queues/*`, `changes`) | Row exit animation when an item is actioned (approved/endorsed → row collapses out) | Confirms the item left the queue; satisfying and reduces "did that work?" doubt | M |

> Recommendation: **2.1** is the highest-value attention cue in the app. **2.5**
> pairs well with it (item enters a queue with a bump, leaves with a collapse).
> `@formkit/auto-animate` (~2kb) is the lazy way to get 2.5 list transitions
> without hand-rolling exit animations — evaluate vs. a CSS-only approach.

---

## 3. Sparking interest (features & upsell)

We just shipped the switchboard "show an off module as a greyed upsell" path
(PR #52). Motion is exactly how an upsell earns a click.

| # | Where | What | Why | Effort |
|---|-------|------|-----|--------|
| 3.1 | `src/components/app/app-sidebar.tsx` — the greyed, locked "upsell" nav items (module off, shown) | A slow, subtle shimmer/sheen on hover (not constant) + lock icon nudge | Turns a dead greyed row into "ooh, what's that?" — directly serves the buy-in goal behind PR #52 | M |
| 3.2 | `src/components/app/stat-card.tsx` — dashboard stat tiles | Count-up from 0 on first mount; keep the existing hover ring | Numbers animating in makes the dashboard feel responsive and worth watching | S |
| 3.3 | Dashboard widget grid (`dashboard/page.tsx`, `widgets.tsx`) — Suspense boundaries | Staggered fade/rise as each widget resolves (replace the plain skeleton pop) | The dashboard assembling itself reads as "alive," not "loading" | M |
| 3.4 | `src/components/app/module-off-alert.tsx` / module-off surfaces | A gentle attention pulse on the "enable this module" CTA | Same buy-in intent as 3.1, at the point of contact inside a feature page | S |
| 3.5 | Marketing pages (`src/components/marketing/*`) | Already the most animated area — audit for consistency, not new work | Keep the in-app language consistent with the pitch the commissioner has seen | S |

> Recommendation: **3.1** ties straight back to the switchboard feature and the
> stated goal ("increase chances of people buying in"). Worth prototyping first.

---

## Suggested sequencing (for discussion)

1. **Foundation (S):** motion tokens + a `prefers-reduced-motion` utility in
   `globals.css`; the check-draw keyframe. Unblocks 1.1, 1.4, 1.5.
2. **Highest leverage (S–M):** 1.1 (all successes), 2.1 (queue badges), 3.2
   (stat count-up).
3. **Signature & upsell moments (M):** 1.2, 3.1.
4. **Celebrations (M):** 1.3, then maybe 1.4 — only after we agree confetti stays
   rare.
5. **List transitions (M):** 2.5 / 2.4, deciding CSS-only vs. `auto-animate`.

## Dependencies — only if we opt in

- `@formkit/auto-animate` (~2kb) — list enter/exit for 2.4, 2.5. Zero-config.
- `canvas-confetti` (~6kb) — the *one-time* celebrations (1.3, 1.4) only.
- Everything else: `tailwindcss-animate` + CSS keyframes we already can write.

_Nothing above is built. Review, strike what doesn't fit a regulated tool, and
we'll turn the survivors into scoped tasks._
