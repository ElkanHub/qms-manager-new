import Link from "next/link";
import { Activity, FilePen, GitPullRequestArrow, AlertTriangle, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AnimatedCount } from "@/components/app/animated-count";

// D-DASHBOARD status strip — a persistent glance at the top of the dashboard,
// distinct from the configurable widget grid below it. Four live numbers a
// QA-led team watches: who's active right now, this week's document momentum,
// the open-change backlog, and the review-overdue risk. Org-wide for admins
// (departmentId null); department-scoped for everyone else. RLS scopes to tenant
// regardless. Tolerant of empty/errored data — a cell just shows 0.
export async function StatusStrip({ departmentId }: { departmentId: string | null }) {
  const supabase = await createClient();
  const now = Date.now();
  const online15 = new Date(now - 15 * 60_000).toISOString();
  const week = new Date(now - 7 * 86_400_000).toISOString();
  const nowIso = new Date(now).toISOString();

  // Department lens for the doc/change metrics (online-now stays tenant-wide).
  const scoped = <T extends { eq: (c: string, v: string) => T }>(q: T) =>
    departmentId ? q.eq("department_id", departmentId) : q;

  const [actors, updatedWeek, openChanges, overdueReview] = await Promise.all([
    supabase.from("audit_trail").select("actor_email").gte("occurred_at", online15).limit(1000),
    scoped(
      supabase.from("documents").select("*", { count: "exact", head: true })
        .eq("status", "active").gte("updated_at", week),
    ),
    scoped(
      supabase.from("change_controls").select("*", { count: "exact", head: true })
        .not("status", "in", "(closed,rejected)"),
    ),
    scoped(
      supabase.from("documents").select("*", { count: "exact", head: true })
        .eq("status", "active").lt("next_review_at", nowIso),
    ),
  ]);

  const onlineNow = new Set((actors.data ?? []).map((r) => r.actor_email).filter(Boolean)).size;

  const cells: { label: string; value: number; href: string; icon: LucideIcon; alert?: boolean }[] = [
    { label: "Online now", value: onlineNow, href: "/audit", icon: Activity },
    { label: "SOPs updated this week", value: updatedWeek.count ?? 0, href: "/library", icon: FilePen },
    { label: "Open change controls", value: openChanges.count ?? 0, href: "/changes", icon: GitPullRequestArrow },
    {
      label: "Overdue for review",
      value: overdueReview.count ?? 0,
      href: "/periodic",
      icon: AlertTriangle,
      alert: (overdueReview.count ?? 0) > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 divide-x divide-y rounded-lg border sm:grid-cols-4 sm:divide-y-0">
      {cells.map((c) => (
        <Link
          key={c.label}
          href={c.href}
          className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50"
        >
          <c.icon
            className={`size-5 shrink-0 ${c.alert ? "text-status-blocked animate-soft-pulse" : "text-muted-foreground"}`}
            aria-hidden
          />
          <span className="min-w-0">
            <span className={`block text-2xl font-semibold tabular-nums ${c.alert ? "text-status-blocked" : ""}`}>
              <AnimatedCount value={c.value} />
            </span>
            <span className="block truncate text-xs text-muted-foreground">{c.label}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
