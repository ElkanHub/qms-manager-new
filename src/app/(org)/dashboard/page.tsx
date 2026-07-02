import Link from "next/link";
import {
  GitPullRequestArrow,
  CalendarClock,
  Flame,
  FileText,
  GraduationCap,
  Flag,
} from "lucide-react";
import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

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
    { label: "Open change controls", value: openChanges.count ?? 0, href: "/changes", icon: GitPullRequestArrow },
    { label: "Documents due for review", value: dueReview.count ?? 0, href: "/periodic", icon: CalendarClock },
    { label: "Retention-expiry queue", value: retentionQueue.count ?? 0, href: "/queues/destruction", icon: Flame },
    { label: "In-flight documents", value: inFlight.count ?? 0, href: "/library", icon: FileText },
    { label: "Incomplete training", value: openTraining.count ?? 0, href: "/training", icon: GraduationCap },
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
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Dashboard"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/audit">Audit trail →</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/feedback">
                <Flag aria-hidden />
                Flag this
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} href={c.href} icon={c.icon} />
        ))}
      </div>

      {u && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            title="Flow completion"
            description={`Derived from the audit trail — last ${u.window_days} days.`}
          >
            <ul className="space-y-4 text-sm">
              {funnelRows.map((r) => {
                const a = r.a ?? 0;
                const b = r.b ?? 0;
                return (
                  <li key={r.label} className="space-y-1.5">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="font-medium tabular-nums">{a} → {b}</span>
                    </div>
                    <Progress value={a ? (b / a) * 100 : 0} />
                  </li>
                );
              })}
              <li className="flex justify-between gap-4">
                <span className="text-muted-foreground">Feedback flags</span>
                <span className="font-medium tabular-nums">{u.funnel.feedback_flags ?? 0}</span>
              </li>
            </ul>
          </SectionCard>

          <SectionCard
            title="Busiest screens"
            description="Where work happens across the tenant."
          >
            <ul className="space-y-2 text-sm">
              {u.screens.slice(0, 8).map((s) => (
                <li key={s.screen} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{s.screen}</span>
                  <span className="font-mono tabular-nums">{s.actions}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
