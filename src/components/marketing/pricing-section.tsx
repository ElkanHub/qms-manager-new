"use client"

import { useState } from "react"
import Link from "next/link"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTabIndicator } from "@/hooks/use-tab-indicator"
import SectionGrainient from "@/components/marketing/section-grainient"

type Tier = {
  id: string
  name: string
  price: { monthly: number; annual: number } | null
  blurb: string
  features: string[]
  cta: string
  href: string
  highlight: boolean
}

const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    price: { monthly: 0, annual: 0 },
    blurb: "Free forever. For small teams getting their procedures in order.",
    features: [
      "Up to 5 users",
      "Up to 25 SOPs",
      "1 department",
      "Basic versioning & manual approvals",
      "Read-only .docx rendering",
      "Email support",
    ],
    cta: "Start free",
    href: "/signup",
    highlight: false,
  },
  {
    id: "team",
    name: "Team",
    price: { monthly: 59, annual: 49 },
    blurb: "Everything mid-sized teams need to pass an audit.",
    features: [
      "Unlimited users, SOPs, departments",
      "QA-routed approvals & e-signatures",
      "Real-time Pulse",
      "Mobile signature capture",
      "Change Control with snapshot signatories",
      "Equipment PMs & training modules",
      "Priority email support",
    ],
    cta: "Start 14-day trial",
    href: "/signup",
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: null,
    blurb: "For regulated industries with validation requirements.",
    features: [
      "Everything in Team",
      "SSO / SAML",
      "Audit-ready exports (Form 483 prep)",
      "Dedicated success manager",
      "99.9% uptime SLA",
      "Validation documentation package",
      "Custom data residency",
    ],
    cta: "Talk to sales",
    href: "/contact",
    highlight: false,
  },
]

export default function PricingSection() {
  const [period, setPeriod] = useState<"monthly" | "annual">("annual")
  const { rect, setRef } = useTabIndicator<"monthly" | "annual">(period)

  return (
    <section id="pricing" className="relative overflow-hidden scroll-mt-24 border-y border-border/60 py-24 lg:py-32">
      <SectionGrainient preset="pricing" />
      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-blue uppercase">
            Plans &amp; Pricing
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight text-balance text-brand-navy sm:text-5xl">
            Pick a plan. Skip the binder.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Predictable per-user pricing. No setup fees. Cancel any time.
          </p>
        </div>

        <div className="mt-10 flex justify-center">
          <div className="relative inline-flex items-center gap-1 rounded-full border border-border bg-card p-1.5 shadow-sm">
            <span
              aria-hidden
              className={cn(
                "absolute top-1.5 bottom-1.5 rounded-full bg-brand-navy transition-[left,width] duration-300 ease-out",
                rect ? "opacity-100" : "opacity-0"
              )}
              style={{ left: rect?.left ?? 0, width: rect?.width ?? 0 }}
            />
            <button
              ref={setRef("monthly")}
              onClick={() => setPeriod("monthly")}
              className={cn(
                "relative z-10 rounded-full px-5 py-2 text-sm font-medium transition-colors duration-300",
                period === "monthly"
                  ? "text-white"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Monthly
            </button>
            <button
              ref={setRef("annual")}
              onClick={() => setPeriod("annual")}
              className={cn(
                "relative z-10 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors duration-300",
                period === "annual"
                  ? "text-white"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Annual
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors duration-300",
                  period === "annual"
                    ? "bg-white/15 text-white"
                    : "bg-brand-teal/15 text-brand-teal"
                )}
              >
                Save 17%
              </span>
            </button>
          </div>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={cn(
                "relative flex flex-col rounded-3xl border p-8 transition-all",
                tier.highlight
                  ? "border-brand-blue/40 bg-card shadow-xl ring-1 ring-brand-blue/15 lg:scale-[1.02]"
                  : "border-border bg-card hover:border-foreground/20"
              )}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-brand-blue px-3 py-1 text-[11px] font-semibold tracking-wide uppercase text-white shadow-sm">
                    Most popular
                  </span>
                </div>
              )}

              <h3 className="text-lg font-semibold text-brand-navy">
                {tier.name}
              </h3>
              <p className="mt-2 min-h-[2.75rem] text-sm text-muted-foreground">{tier.blurb}</p>

              <div className="mt-6">
                {tier.price ? (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-5xl font-semibold tracking-tight text-brand-navy">
                      ${tier.price[period]}
                    </span>
                    <span className="text-sm text-muted-foreground">/ user / mo</span>
                  </div>
                ) : (
                  <div className="text-3xl font-semibold tracking-tight text-brand-navy">
                    Custom
                  </div>
                )}
                <p className="mt-1.5 min-h-[1.25rem] text-xs text-muted-foreground">
                  {tier.price && period === "annual" && tier.price.annual > 0
                    ? `Billed annually at $${tier.price.annual * 12}/user`
                    : tier.price && tier.price.monthly === 0
                    ? "Free forever — no card required"
                    : tier.price === null
                    ? "Contact sales for volume pricing"
                    : "Billed monthly, cancel any time"}
                </p>
              </div>

              <Link
                href={tier.href}
                className={cn(
                  "mt-7 inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold transition-all active:translate-y-px",
                  tier.highlight
                    ? "bg-brand-navy text-white shadow-xl shadow-brand-navy/30 hover:bg-brand-navy/90"
                    : "border border-border bg-background text-foreground hover:bg-muted"
                )}
              >
                {tier.cta}
              </Link>

              <ul className="mt-8 space-y-3">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-teal" />
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          All plans include immutable audit trail, RLS-enforced security, and soft-delete by default.
        </p>
      </div>
    </section>
  )
}
