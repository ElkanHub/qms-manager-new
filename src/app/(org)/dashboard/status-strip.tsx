import { Fragment } from "react";
import Link from "next/link";
import { FilePen, GitPullRequestArrow, AlertTriangle, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { OnlineNow } from "./online-now";

// D-DASHBOARD status strip — a persistent glance at the top of the dashboard,
// distinct from the configurable widget grid below it. Four live numbers a
// QA-led team watches: who's active right now, this week's document momentum,
// the open-change backlog, and the review-overdue risk. Org-wide for admins
// (departmentId null); department-scoped for everyone else. RLS scopes to tenant
// regardless. Tolerant of empty/errored data — a cell just shows 0.
export async function StatusStrip({
  departmentId,
  orgId,
}: {
  departmentId: string | null;
  orgId: string | null;
}) {
  const supabase = await createClient();
  const now = Date.now();
  const online15 = new Date(now - 15 * 60_000).toISOString();
  const week = new Date(now - 7 * 86_400_000).toISOString();
  const nowIso = new Date(now).toISOString();

  // Department lens for the doc/change metrics (online-now stays tenant-wide).
  const scoped = <T extends { eq: (c: string, v: string) => T }>(q: T) =>
    departmentId ? q.eq("department_id", departmentId) : q;

  // Seed the live "online now" cell — org-scoped (RLS also scopes to tenant).
  let actorsQuery = supabase.from("audit_trail").select("actor_email").gte("occurred_at", online15).limit(1000);
  if (orgId) actorsQuery = actorsQuery.eq("org_id", orgId);

  const [actors, updatedWeek, openChanges, overdueReview] = await Promise.all([
    actorsQuery,
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

  const onlineSeed = new Set((actors.data ?? []).map((r) => r.actor_email).filter(Boolean)).size;

  const cells: { label: string; value: number; href: string; icon: LucideIcon; alert?: boolean }[] = [
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

  // A thin inline strip (old project's principles): items flow and wrap with
  // gaps, the number sits inline with its label, and the vertical dividers hide
  // on mobile so a wrapped layout never leaves a dangling separator. "Online now"
  // is the one live cell (client-polled); the rest are server-rendered.
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <OnlineNow initial={onlineSeed} href="/audit" />
      {cells.map((c) => (
        <Fragment key={c.label}>
          <div className="hidden h-4 w-px bg-border sm:block" aria-hidden />
          <Link href={c.href} className="flex items-center gap-2 transition-colors hover:text-foreground">
            <c.icon className={`size-3.5 shrink-0 ${c.alert ? "text-status-blocked" : ""}`} aria-hidden />
            <span className={`tabular-nums ${c.alert ? "text-status-blocked" : "text-foreground"}`}>{c.value}</span>
            <span>{c.label}</span>
          </Link>
        </Fragment>
      ))}
    </div>
  );
}
