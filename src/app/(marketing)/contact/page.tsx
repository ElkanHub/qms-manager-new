import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Calendar, Mail, MessageSquare } from "lucide-react"
import SectionGrainient from "@/components/marketing/section-grainient"

export const metadata: Metadata = {
  title: "Contact — QMS-MANAJA",
  description:
    "Talk to our compliance team about pilot programs, validation packages, and rollout support for QA-led organizations.",
}

const CHANNELS = [
  {
    icon: Mail,
    title: "Email us",
    body: "For pilots, validation packages, and procurement questions.",
    cta: "hello@QMS-MANAJA.app",
    href: "mailto:hello@QMS-MANAJA.app",
  },
  {
    icon: Calendar,
    title: "Book a guided demo",
    body: "Walk through your workflows live with a compliance specialist.",
    cta: "Schedule a 30-min call",
    href: "mailto:demo@QMS-MANAJA.app?subject=Demo%20request",
  },
  {
    icon: MessageSquare,
    title: "Talk to sales",
    body: "Pricing, multi-site rollouts, and Enterprise validation packages.",
    cta: "sales@QMS-MANAJA.app",
    href: "mailto:sales@QMS-MANAJA.app",
  },
] as const

export default function ContactPage() {
  return (
    <section className="relative overflow-hidden mx-auto max-w-5xl px-6 pt-32 pb-24 sm:pt-40 lg:px-8 lg:pt-44 lg:pb-32">
      <SectionGrainient preset="contact" />
      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-[0.18em] text-brand-blue uppercase">
          Get in touch
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance text-brand-navy sm:text-5xl">
          Let&apos;s make your floor inspection-ready.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Whether you&apos;re replacing a binder, migrating from a legacy QMS, or rolling out
          across multiple sites — we&apos;ll meet you where you are.
        </p>
      </div>

      <div className="relative z-10 mt-14 grid gap-6 lg:grid-cols-3">
        {CHANNELS.map((channel) => {
          const Icon = channel.icon
          return (
            <a
              key={channel.title}
              href={channel.href}
              className="group relative overflow-hidden rounded-3xl border border-border bg-card p-8 transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-soft"
            >
              <div className="grid size-12 place-items-center rounded-xl bg-brand-blue/10 text-brand-blue">
                <Icon className="size-6" />
              </div>
              <h2 className="mt-6 text-xl font-semibold text-brand-navy">{channel.title}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                {channel.body}
              </p>
              <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue transition-all group-hover:gap-2">
                {channel.cta}
                <ArrowRight className="size-4" />
              </span>
            </a>
          )
        })}
      </div>

      <div className="relative z-10 mt-16 rounded-3xl border border-border bg-white/80 backdrop-blur-sm p-8 text-center sm:p-12">
        <h2 className="text-2xl font-semibold tracking-tight text-brand-navy sm:text-3xl">
          Ready to skip the binder?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Start a 14-day trial — full access, no credit card, no call required.
        </p>
        <Link
          href="/contact"
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-navy px-6 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-navy/90 active:translate-y-px"
        >
          Start free trial
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  )
}
