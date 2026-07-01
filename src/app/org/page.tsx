import Link from "next/link";
import { requireOrgUser, getMyRoles } from "@/lib/auth";

// S-ORG-HOME — the org-plane control center for QA (and Org-Admin). Entry points
// to user, department, and role management. Distinct from the platform board.
export default async function OrgHome() {
  const user = await requireOrgUser();
  const roles = await getMyRoles();
  const isQA = roles.includes("qa");

  const cards = [
    { href: "/intake", title: "Start a request", desc: "New SOP, change, or retirement — one door." },
    { href: "/queues/endorse", title: "Endorsement queue", desc: "Employee submissions awaiting HOD endorsement." },
    { href: "/queues/qa-review", title: "QA review", desc: "Documents awaiting QA approval." },
    { href: "/changes", title: "Change controls", desc: "Screen and drive change controls." },
    { href: "/queues/retirements", title: "Retirements", desc: "Review discontinuation requests (QA)." },
    { href: "/queues/destruction", title: "Destruction queue", desc: "Time-gated destruction of retained versions." },
    { href: "/org/classify", title: "Classification matrix", desc: "Risk class → required signatures (QA)." },
    { href: "/library", title: "SOP Library", desc: "Browse effective documents; Master Index." },
    { href: "/training", title: "Training", desc: "Assign and record training; threshold status." },
    { href: "/copies", title: "Controlled copies", desc: "Issue and reconcile controlled copies." },
    { href: "/periodic", title: "Periodic review", desc: "Documents due/overdue for review." },
    { href: "/dashboard", title: "Dashboards", desc: "State-of-the-system oversight." },
    { href: "/org/users", title: "Users & roles", desc: "Invite, assign roles, deactivate." },
    { href: "/org/departments", title: "Departments", desc: "Create departments, assign HODs." },
    { href: "/org/invite", title: "Send invitation", desc: "Invite a new org user." },
    { href: "/org/numbering", title: "Numbering", desc: "Define your SOP-number format (QA)." },
    { href: "/org/modules", title: "Modules", desc: "See enabled modules (read-only)." },
    { href: "/audit", title: "Audit trail", desc: "Your organization's audit log." },
  ];

  return (
    <main className="mx-auto max-w-3xl p-8">
      <p className="text-sm text-neutral-500">Organization control center</p>
      <h1 className="text-2xl font-semibold">Welcome{user.full_name ? `, ${user.full_name}` : ""}</h1>
      <p className="mt-1 text-sm text-neutral-600">
        You are signed in as {isQA ? "QA (org root authority)" : roles.join(", ") || "an org user"}.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href}
            className="rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400">
            <div className="font-medium">{c.title}</div>
            <div className="mt-1 text-sm text-neutral-600">{c.desc}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
