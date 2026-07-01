import Link from "next/link";
import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Usage = {
  window_days: number;
  screens: { screen: string; actions: number }[];
  funnel: Record<string, number>;
};

// D-DASHBOARD — state-of-the-system oversight. Counts are RLS-scoped to the tenant.
// The audit viewer for document-control entities is the foundation's S-AUDIT at
// /audit (filterable by action/entity).
export default async function Dashboard() {
  await requireOrgUser();
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [openChanges, dueReview, retentionQueue, inFlight, openTraining, usage] = await Promise.all([
    supabase.from("change_controls").select("*", { count: "exact", head: true })
      .not("status", "in", "(closed,rejected)"),
    supabase.from("documents").select("*", { count: "exact", head: true })
      .eq("status", "active").lte("next_review_at", nowIso),
    supabase.from("document_versions").select("*", { count: "exact", head: true })
      .eq("status", "retained").lte("retention_until", nowIso),
    supabase.from("documents").select("*", { count: "exact", head: true })
      .in("status", ["in_review", "locked_in_cc", "pending_training", "scheduled"]),
    supabase.from("training_assignments").select("*", { count: "exact", head: true })
      .eq("status", "assigned"),
    supabase.rpc("usage_summary", { p_days: 30 }),
  ]);

  const cards = [
    { label: "Open change controls", value: openChanges.count ?? 0, href: "/changes" },
    { label: "Documents due for review", value: dueReview.count ?? 0, href: "/periodic" },
    { label: "Retention-expiry queue", value: retentionQueue.count ?? 0, href: "/queues/destruction" },
    { label: "In-flight documents", value: inFlight.count ?? 0, href: "/library" },
    { label: "Incomplete training", value: openTraining.count ?? 0, href: "/training" },
  ];

  // usage_summary is QA/org-admin only — everyone else just doesn't see the section.
  const u = (usage.error ? null : usage.data) as Usage | null;
  const funnelRows = u
    ? [
        { label: "Intakes started → dispatched", a: u.funnel.intakes_started, b: u.funnel.intakes_dispatched },
        { label: "Drafts created → submitted", a: u.funnel.drafts_created, b: u.funnel.drafts_submitted },
        { label: "Changes opened → closed", a: u.funnel.changes_opened, b: u.funnel.changes_closed },
      ]
    : [];

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboards</h1>
        <div className="flex gap-4">
          <Link href="/feedback" className="text-sm underline">Flag this →</Link>
          <Link href="/audit" className="text-sm underline">Audit trail →</Link>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.label} href={c.href}
            className="rounded-lg border border-neutral-200 bg-white p-5 hover:border-neutral-400">
            <div className="text-3xl font-semibold">{c.value}</div>
            <div className="mt-1 text-sm text-neutral-600">{c.label}</div>
          </Link>
        ))}
      </div>

      {u && (
        <section className="mt-10">
          <h2 className="text-lg font-medium">Usage — last {u.window_days} days</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Derived from the audit trail: where work happens, and where flows stall.
          </p>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <div className="rounded-lg border border-neutral-200 bg-white p-5">
              <h3 className="text-sm font-medium text-neutral-700">Flow completion</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {funnelRows.map((r) => (
                  <li key={r.label} className="flex justify-between gap-4">
                    <span className="text-neutral-600">{r.label}</span>
                    <span className="font-medium">{r.a ?? 0} → {r.b ?? 0}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-4">
                  <span className="text-neutral-600">Feedback flags</span>
                  <span className="font-medium">{u.funnel.feedback_flags ?? 0}</span>
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-5">
              <h3 className="text-sm font-medium text-neutral-700">Busiest screens</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {u.screens.slice(0, 8).map((s) => (
                  <li key={s.screen} className="flex justify-between gap-4">
                    <span className="text-neutral-600">{s.screen}</span>
                    <span className="font-medium">{s.actions}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
