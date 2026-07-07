"use client"

import { useState } from "react"
import {
  Bell,
  CheckCircle2,
  FileText,
  Layers,
  Lock,
  Radar,
  Search,
  ShieldCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useTabIndicator } from "@/hooks/use-tab-indicator"
import SectionGrainient from "@/components/marketing/section-grainient"

type Panel = {
  title: string
  body: string
  visual: React.ReactNode
}

type Tab = {
  id: string
  label: string
  eyebrow: string
  headline: string
  subline: string
  panels: Panel[]
}

const TABS: Tab[] = [
  {
    id: "library",
    label: "SOP Control",
    eyebrow: "Library",
    headline: "Procedures that don't drift.",
    subline: "Versioned, locked, and rendered read-only — what's signed is what's used.",
    panels: [
      {
        title: "Versioned. Audited. Locked.",
        body: "Two-digit GMP revision control with Change Control signoff. When a Change Control opens against an SOP, the document locks until completion — no parallel edits, no race conditions.",
        visual: <VersionsMock />,
      },
      {
        title: "Upload .docx. Render read-only.",
        body: "Mammoth.js renders Word files in-app with DOMPurify sanitization. No editor, no copy-paste drift — just the document, rendered the same way every time.",
        visual: <DocumentMock />,
      },
      {
        title: "Department, not silo.",
        body: "The Library defaults to your department. Search exposes every active SOP across the org so nothing gets lost — but cross-department SOPs render read-only by design.",
        visual: <CrossDeptMock />,
      },
    ],
  },
  {
    id: "approvals",
    label: "Approvals & E-sign",
    eyebrow: "Sign-offs",
    headline: "Sign-offs without surprises.",
    subline: "QA-routed, snapshot-protected, mobile-ready — every signature accounted for.",
    panels: [
      {
        title: "QA holds the pen.",
        body: "No SOP goes Active without a QA manager sign-off — and the rule is enforced inside the database, not the app code. QA managers can't self-approve. Ever.",
        visual: <QAStampMock />,
      },
      {
        title: "Snapshot signatories.",
        body: "When a Change Control opens, required signers are frozen at that moment. Transfers, new hires, and offboarding mid-cycle never affect who needs to sign.",
        visual: <SnapshotMock />,
      },
      {
        title: "Sign on the floor.",
        body: "Generate a one-time mobile link, scan, sign. The signature image is stored alongside an immutable certificate — no shared logins, no proxies, no excuses.",
        visual: <MobileSigMock />,
      },
    ],
  },
  {
    id: "pulse",
    label: "The Pulse",
    eyebrow: "Real-time",
    headline: "Real-time, everywhere.",
    subline: "Pending approvals, equipment due, expiring training — surfaced the moment they happen.",
    panels: [
      {
        title: "Live, not lagged.",
        body: "A single Realtime subscription per user keeps every relevant change in view. No refresh required, no email digests to chase, no batch jobs to wait on.",
        visual: <LivePulseMock />,
      },
      {
        title: "Smart counters.",
        body: "Two badge buckets — explicit acknowledgements for notices, and \"new since last view\" for everything else. A count means action is needed, not noise.",
        visual: <CountersMock />,
      },
      {
        title: "One source. Many eyes.",
        body: "Audience-wide notices broadcast as a single row with audience filtering on the client — no per-recipient fan-out, no replication. Built to scale.",
        visual: <BroadcastMock />,
      },
    ],
  },
]

export default function TabbedBenefits() {
  const [activeId, setActiveId] = useState(TABS[0].id)
  const active = TABS.find((t) => t.id === activeId)!
  const { rect, setRef } = useTabIndicator<string>(activeId)

  return (
    <section id="features" className="relative overflow-hidden scroll-mt-24 border-y border-border/60 py-24 lg:py-32">
      <SectionGrainient preset="features" />
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-blue uppercase">
            Built around the work
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-balance text-brand-navy sm:text-5xl">
            Three pillars. One controlled system.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Replace the binder, the spreadsheet, and the email chain with a single source of truth
            your inspectors will actually trust.
          </p>
        </div>

        <div className="mt-12 flex justify-center">
          <div
            role="tablist"
            className="relative inline-flex justify-center gap-1 rounded-full border border-border bg-card p-1.5 shadow-sm"
          >
            <span
              aria-hidden
              className={cn(
                "absolute top-1.5 bottom-1.5 rounded-full bg-brand-navy shadow-sm transition-[left,width] duration-300 ease-out",
                rect ? "opacity-100" : "opacity-0"
              )}
              style={{ left: rect?.left ?? 0, width: rect?.width ?? 0 }}
            />
            {TABS.map((tab) => (
              <button
                key={tab.id}
                ref={setRef(tab.id)}
                role="tab"
                aria-selected={activeId === tab.id}
                onClick={() => setActiveId(tab.id)}
                className={cn(
                  "relative z-10 rounded-full px-5 py-2 text-sm font-medium transition-colors duration-300",
                  activeId === tab.id
                    ? "text-white"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div key={active.id} className="mt-16 animate-in fade-in duration-500">
          <div className="mx-auto max-w-3xl text-center">
            <h3 className="text-3xl font-semibold tracking-tight text-balance text-brand-navy sm:text-4xl">
              {active.headline}
            </h3>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">{active.subline}</p>
          </div>

          <div className="mt-16 space-y-20">
            {active.panels.map((panel, i) => (
              <div
                key={panel.title}
                className={cn(
                  "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
                  i % 2 === 1 && "lg:[&>div:first-child]:order-2"
                )}
              >
                <div>
                  <h4 className="text-2xl font-semibold tracking-tight text-balance text-brand-navy sm:text-3xl">
                    {panel.title}
                  </h4>
                  <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">
                    {panel.body}
                  </p>
                </div>
                <div className="relative">
                  <div
                    aria-hidden
                    className="absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-brand-blue/[0.06] via-transparent to-brand-teal/[0.06] blur-xl"
                  />
                  <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
                    {panel.visual}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- Visual mocks */

function VersionsMock() {
  const versions = [
    { v: "02", status: "Active", locked: true },
    { v: "01", status: "Archived", locked: false },
    { v: "00", status: "Archived", locked: false },
  ]
  return (
    <div className="space-y-3">
      {versions.map((item, i) => (
        <div
          key={item.v}
          className={cn(
            "flex items-center justify-between rounded-xl border p-4 transition-all",
            i === 0
              ? "border-brand-teal/40 bg-brand-teal/5"
              : "border-border/60 bg-muted/40 opacity-70"
          )}
          style={{ marginLeft: `${i * 12}px` }}
        >
          <div>
            <p className="text-sm font-semibold text-foreground">{item.v}</p>
            <p className="text-xs text-muted-foreground">{item.status}</p>
          </div>
          {item.locked ? (
            <div className="flex items-center gap-1.5 rounded-full bg-brand-teal/10 px-2.5 py-1 text-[11px] font-semibold text-brand-teal">
              <Lock className="size-3" />
              Locked
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function DocumentMock() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">SOP-014 — Tablet Coating</span>
        </div>
        <span className="rounded-full bg-brand-blue/10 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase text-brand-blue">
          Read only
        </span>
      </div>
      <div className="mt-4 space-y-2.5">
        <div className="h-2 rounded-full bg-muted" />
        <div className="h-2 w-5/6 rounded-full bg-muted" />
        <div className="h-2 w-4/6 rounded-full bg-muted" />
        <div className="h-2 w-5/6 rounded-full bg-muted" />
        <div className="h-2 w-3/6 rounded-full bg-muted" />
        <div className="h-2 w-5/6 rounded-full bg-muted" />
      </div>
    </div>
  )
}

function CrossDeptMock() {
  const results = [
    { dept: "Manufacturing", title: "Aseptic Gowning Procedure", own: true },
    { dept: "QA", title: "Cleanroom Audit Checklist", own: false },
    { dept: "Lab", title: "BSC Gowning Protocol", own: false },
  ]
  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        <Search className="size-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">aseptic gowning</span>
      </div>
      <div className="mt-3 space-y-2">
        {results.map((r) => (
          <div
            key={r.title}
            className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2.5 text-sm"
          >
            <span className="text-foreground">{r.title}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                r.own
                  ? "bg-brand-teal/10 text-brand-teal"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {r.dept}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function QAStampMock() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground">
            Approval required
          </p>
          <p className="mt-1.5 text-base font-semibold text-foreground">SOP-014 Rev. 02</p>
          <p className="text-xs text-muted-foreground">Tablet Coating procedure</p>
        </div>
        <div className="grid size-11 place-items-center rounded-full bg-brand-blue/10">
          <ShieldCheck className="size-5 text-brand-blue" />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-brand-blue/20 bg-brand-blue/5 p-3">
        <CheckCircle2 className="size-4 text-brand-blue" />
        <span className="text-xs font-medium text-brand-blue">
          QA Manager approval — required to publish
        </span>
      </div>
    </div>
  )
}

function SnapshotMock() {
  const signers = [
    { name: "M. Adeyemi", role: "QA Manager", signed: true },
    { name: "S. Park", role: "Manufacturing Lead", signed: true },
    { name: "L. Vance", role: "Lab Director", signed: false },
    { name: "R. Okafor", role: "Operations", signed: false },
  ]
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">CC-219 Signatories</span>
        <span className="text-[10px] text-muted-foreground">Captured 14:02</span>
      </div>
      <div className="mt-4 space-y-2">
        {signers.map((p) => (
          <div
            key={p.name}
            className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2.5"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{p.name}</p>
              <p className="text-[11px] text-muted-foreground">{p.role}</p>
            </div>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                p.signed
                  ? "bg-brand-teal/10 text-brand-teal"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {p.signed ? "Signed" : "Pending"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MobileSigMock() {
  return (
    <div className="flex justify-center">
      <div className="relative w-44 rounded-[28px] border-[6px] border-foreground/85 bg-background p-2 shadow-2xl">
        <div className="rounded-[18px] bg-muted/50 p-3">
          <p className="text-[10px] font-semibold tracking-wide uppercase text-muted-foreground">
            Sign here
          </p>
          <p className="mt-1 text-[11px] font-semibold text-foreground">SOP-014 Rev. 02</p>
          <div className="mt-2 h-24 rounded-md border border-dashed border-border bg-card">
            <svg className="h-full w-full" viewBox="0 0 200 100" preserveAspectRatio="none">
              <path
                d="M10 70 Q 50 20 90 50 T 170 40"
                strokeWidth="3"
                fill="none"
                className="stroke-foreground"
              />
            </svg>
          </div>
          <div className="mt-3 rounded-lg bg-brand-navy py-2 text-center text-[10px] font-semibold text-white">
            Submit signature
          </div>
        </div>
      </div>
    </div>
  )
}

function LivePulseMock() {
  const items = [
    { kind: "Approval", title: "SOP-014 Rev. 02", time: "2m" },
    { kind: "PM Due", title: "Autoclave-3", time: "1h" },
    { kind: "Training", title: "Sarah K. — Cleanroom", time: "3h" },
  ]
  return (
    <div>
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex">
            <Radar className="size-4 text-brand-blue" />
            <span className="absolute -right-1 -top-1 size-2 rounded-full bg-brand-teal animate-ping" />
            <span className="absolute -right-1 -top-1 size-2 rounded-full bg-brand-teal" />
          </span>
          <span className="text-sm font-semibold">Pulse</span>
        </div>
        <span className="rounded-full bg-brand-teal px-2 py-0.5 text-[10px] font-semibold text-white">
          4
        </span>
      </div>
      <div className="mt-3 space-y-2.5">
        {items.map((n) => (
          <div
            key={n.title}
            className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5"
          >
            <div>
              <p className="text-[10px] font-semibold tracking-wide uppercase text-muted-foreground">
                {n.kind}
              </p>
              <p className="text-sm font-medium text-foreground">{n.title}</p>
            </div>
            <span className="text-[10px] text-muted-foreground">{n.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CountersMock() {
  return (
    <div className="flex items-center justify-around gap-6">
      <div className="text-center">
        <div className="relative inline-block">
          <div className="grid size-16 place-items-center rounded-2xl bg-brand-navy/5">
            <Bell className="size-8 text-brand-navy" />
          </div>
          <span className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-brand-teal text-xs font-bold text-white">
            12
          </span>
        </div>
        <p className="mt-3 text-xs font-semibold text-foreground">Notices unread</p>
        <p className="text-[10px] text-muted-foreground">Acknowledged-bucket</p>
      </div>
      <div className="h-14 w-px bg-border" />
      <div className="text-center">
        <div className="relative inline-block">
          <div className="grid size-16 place-items-center rounded-2xl bg-brand-blue/5">
            <Bell className="size-8 text-brand-blue" />
          </div>
          <span className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-brand-blue text-xs font-bold text-white">
            4
          </span>
        </div>
        <p className="mt-3 text-xs font-semibold text-foreground">New since open</p>
        <p className="text-[10px] text-muted-foreground">Last-view-bucket</p>
      </div>
    </div>
  )
}

function BroadcastMock() {
  return (
    <div>
      <div className="flex items-center justify-center gap-4">
        <div className="grid size-14 place-items-center rounded-2xl bg-brand-blue/10 text-brand-blue">
          <Layers className="size-6" />
        </div>
        <div className="flex flex-col items-center text-muted-foreground">
          <svg width="60" height="40" viewBox="0 0 60 40" fill="none" className="text-muted-foreground">
            <path
              d="M0 20 L40 20 M40 5 L40 20 L40 35 M0 5 L40 5 M0 35 L40 35"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path d="M50 20 L40 14 L40 26 Z" fill="currentColor" />
          </svg>
        </div>
        <div className="flex flex-col gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="size-6 rounded-full bg-brand-teal/15 ring-1 ring-brand-teal/30"
            />
          ))}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <p className="text-lg font-semibold text-foreground">1</p>
          <p className="text-[10px] text-muted-foreground">Source row</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <p className="text-lg font-semibold text-foreground">∞</p>
          <p className="text-[10px] text-muted-foreground">Recipients</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <p className="text-lg font-semibold text-foreground">0</p>
          <p className="text-[10px] text-muted-foreground">Fan-out</p>
        </div>
      </div>
    </div>
  )
}

