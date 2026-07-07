"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Layers, ShieldCheck, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTabIndicator } from "@/hooks/use-tab-indicator"

const TOUR_TABS = [
  {
    id: "dashboard",
    label: "At a glance",
    icon: Layers,
    headline: "Every number that matters, at a glance.",
    body:
      "Active SOPs, pending approvals, PM compliance, and items due for revision — your operational state in one screen, always live. No reports to assemble, no spreadsheets to refresh.",
    points: [
      "Live KPIs sync the moment data changes",
      "Personalized to your role and department",
      "Drill into any number with a single click",
    ],
  },
  {
    id: "actions",
    label: "Quick actions",
    icon: Zap,
    headline: "From idea to action in two clicks.",
    body:
      "Upload an SOP, register equipment, broadcast a notice, or pull a report — directly from the dashboard. No menu hunting, no context switching, no tab roulette.",
    points: [
      "All four hub actions one click from any view",
      "Context-aware shortcuts based on your role",
      "Keyboard shortcuts for power users",
    ],
  },
  {
    id: "compliance",
    label: "Compliance health",
    icon: ShieldCheck,
    headline: "Always inspection-ready.",
    body:
      "Compliance Health and Active Change Controls surface what could become a problem before an auditor finds it. Walk into a Form 483 review with the receipts already pulled.",
    points: [
      "Organizational readiness score, refreshed live",
      "Open Change Controls flagged with pending signers",
      "Audit-ready exports in PDF and CSV",
    ],
  },
] as const

export default function TourTabs() {
  type TourId = (typeof TOUR_TABS)[number]["id"]
  const [activeId, setActiveId] = useState<TourId>(TOUR_TABS[0].id)
  const active = TOUR_TABS.find((t) => t.id === activeId)!
  const { rect, setRef } = useTabIndicator<TourId>(activeId)

  return (
    <section id="tour" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-[0.18em] text-brand-blue uppercase">
          See it in action
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-balance text-brand-navy sm:text-5xl">
          A tour through the floor.
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Three views. One workspace. The same source of truth for every team.
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
          {TOUR_TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeId === tab.id
            return (
              <button
                key={tab.id}
                ref={setRef(tab.id)}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(tab.id)}
                className={cn(
                  "relative z-10 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors duration-300",
                  isActive
                    ? "text-white"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div
        key={active.id}
        className="mt-14 grid items-center gap-12 animate-in fade-in duration-500 lg:grid-cols-2 lg:gap-16"
      >
        <div className="lg:order-2">
          <h3 className="text-3xl font-semibold tracking-tight text-balance text-brand-navy sm:text-4xl">
            {active.headline}
          </h3>
          <p className="mt-5 text-[17px] leading-relaxed text-muted-foreground">{active.body}</p>
          <ul className="mt-8 space-y-3">
            {active.points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-[15px]">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-teal" />
                <span className="text-foreground/90">{p}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/contact"
            className="mt-10 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue transition-all hover:gap-2"
          >
            Try it free
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <div className="relative lg:order-1">
          <div
            aria-hidden
            className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-brand-blue/10 via-transparent to-brand-teal/10 blur-2xl"
          />
          <Image
            src="/marketing/hero-dashboard.webp"
            alt={`${active.label} view of QMS-MANAJA dashboard`}
            width={2000}
            height={1180}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="relative w-full rounded-2xl"
          />
        </div>
      </div>
    </section>
  )
}
