import Link from "next/link";
import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// D-DASHBOARD — state-of-the-system oversight. Counts are RLS-scoped to the tenant.
// The audit viewer for document-control entities is the foundation's S-AUDIT at
// /audit (filterable by action/entity).
export default async function Dashboard() {
  await requireOrgUser();
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [openChanges, dueReview, retentionQueue, inFlight, openTraining] = await Promise.all([
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
  ]);

  const cards = [
    { label: "Open change controls", value: openChanges.count ?? 0, href: "/changes" },
    { label: "Documents due for review", value: dueReview.count ?? 0, href: "/periodic" },
    { label: "Retention-expiry queue", value: retentionQueue.count ?? 0, href: "/queues/destruction" },
    { label: "In-flight documents", value: inFlight.count ?? 0, href: "/library" },
    { label: "Incomplete training", value: openTraining.count ?? 0, href: "/training" },
  ];

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboards</h1>
        <Link href="/audit" className="text-sm underline">Audit trail →</Link>
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
    </main>
  );
}
