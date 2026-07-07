import Link from "next/link"
import { ChevronDown } from "lucide-react"

const ITEMS = [
  {
    q: "How does QMS-MANAJA handle versioning and version control?",
    a: "SOPs follow two-digit GMP revision numbering: 00 for initial issue, 01 for the first revision, 02 for the second revision. When a Change Control opens against an SOP, the document is locked until completion — no parallel edits, no race conditions. Every revision is preserved with its approval signatures, so you can always see what was effective at any point in time.",
  },
  {
    q: "Can multiple departments share the same SOP library?",
    a: "Yes — one library, scoped per department. The default Library view filters to your department's SOPs. Search exposes all active SOPs across the organization (so nothing gets lost), but cross-department SOPs render read-only — your team can't accidentally modify someone else's work. RLS enforces this at the database layer, not just the UI.",
  },
  {
    q: "What happens during a regulatory inspection? How fast can we pull records?",
    a: "Every SOP revision, every approval signature, every training acknowledgment, and every Change Control has an immutable audit trail. Reports can be pulled in seconds — not days. Signature certificates reference stored signature images and live in tables with no UPDATE/DELETE policies, so the audit trail can't be tampered with.",
  },
  {
    q: "Is signature capture compliant with 21 CFR Part 11?",
    a: "Yes. Signatures are user-authenticated, time-stamped, and bound to specific records via immutable certificates. Mobile signing uses one-time tokens — no shared logins. The combination of authenticated capture, immutable storage, and full audit trail satisfies Part 11 requirements for closed systems.",
  },
  {
    q: "Can we import existing SOPs from Word documents?",
    a: "Yes — upload .docx and QMS-MANAJA renders them read-only in-app via Mammoth.js, sanitized with DOMPurify. There's no in-app editor by design: what you upload is what your team sees, every time. Versioning and approval workflows run on top of the uploaded document.",
  },
  {
    q: "How do you handle user offboarding without breaking the audit trail?",
    a: "Profiles are never hard-deleted. Offboarding sets the user inactive, but their FK references in audit logs, signatures, acknowledgments, and Pulse items stay valid forever. The signature on a 2019 SOP will still resolve to the same person 10 years later — even if they've left the company.",
  },
]

export default function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-6 py-24 lg:px-8 lg:py-32">
      <div className="text-center">
        <p className="text-xs font-semibold tracking-[0.18em] text-brand-blue uppercase">
          Frequently asked questions
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-balance text-brand-navy sm:text-5xl">
          Answers, not corporate fog.
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Real questions from QA managers we&apos;ve talked to. Real answers from how the system
          actually works.
        </p>
      </div>

      <div className="mt-12 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {ITEMS.map((item, i) => (
          <details
            key={i}
            className="group [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-4 p-6 transition-colors hover:bg-muted/40">
              <span className="text-base font-semibold text-foreground">{item.q}</span>
              <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-6 pb-6">
              <p className="text-[15px] leading-relaxed text-muted-foreground">{item.a}</p>
            </div>
          </details>
        ))}
      </div>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        Have a question we didn&apos;t answer?{" "}
        <Link href="/contact" className="font-medium text-brand-blue hover:underline">
          Talk to our compliance team
        </Link>
        .
      </p>
    </section>
  )
}
