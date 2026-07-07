import { ClipboardCheck, FlaskConical, ShieldCheck, Wrench } from "lucide-react"

const ROLES = [
  {
    icon: ShieldCheck,
    title: "QA Manager",
    body: "Approval authority, signature audits, deviation visibility — all in one queue. The role the system was built around.",
    accent: "navy",
  },
  {
    icon: Wrench,
    title: "Manufacturing Lead",
    body: "Active SOPs at the line, equipment PMs on the calendar, training compliance tracked per operator.",
    accent: "blue",
  },
  {
    icon: FlaskConical,
    title: "Lab Tech / Operator",
    body: "Quick search, mobile sign-offs, training assignments. The interface stays out of your way.",
    accent: "teal",
  },
  {
    icon: ClipboardCheck,
    title: "Auditor / Inspector",
    body: "Full audit trail, signature certificates, immutable history. Pull a report and walk into the inspection cold.",
    accent: "navy",
  },
] as const

export default function RolesGrid() {
  return (
    <section id="roles" className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-[0.18em] text-brand-blue uppercase">
          Built for every role
        </p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight text-balance text-brand-navy sm:text-5xl">
          One workspace. Every team on the floor.
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Tailored views for the people doing the work — and an immutable audit trail for the
          people checking it.
        </p>
      </div>

      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((role) => {
          const Icon = role.icon
          return (
            <div
              key={role.title}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-7 transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-soft"
            >
              <div
                className={
                  role.accent === "blue"
                    ? "grid size-11 place-items-center rounded-xl bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20"
                    : role.accent === "teal"
                    ? "grid size-11 place-items-center rounded-xl bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/20"
                    : "grid size-11 place-items-center rounded-xl bg-brand-navy/5 text-brand-navy ring-1 ring-brand-navy/10"
                }
              >
                <Icon className="size-5" />
              </div>
              <h3 className="mt-6 text-lg font-semibold text-brand-navy">
                {role.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{role.body}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
