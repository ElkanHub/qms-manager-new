import Link from "next/link";
import {
  CalendarClock,
  Flame,
  FileText,
  GraduationCap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { platformEmailSet, maskActor } from "@/lib/audit-actor";
import { SectionCard } from "@/components/app/section-card";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { WidgetSize } from "./widget-catalogue";

// Server-rendered dashboard widgets. Every widget is RLS-scoped, tolerant of
// empty data and of switched-off modules (an error or no rows just renders the
// quiet empty note) — a widget can never take the dashboard down with it.

export type WidgetCtx = {
  userId: string;
  /** Department lens for department-scoped widgets (the viewer's, or the previewed one). */
  departmentId: string | null;
};

const dateFmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

function EmptyNote({ text }: { text: string }) {
  return <p className="py-4 text-sm text-muted-foreground">{text}</p>;
}

function RowList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y">{children}</ul>;
}

function Row({
  href,
  title,
  meta,
  right,
}: {
  href: string;
  title: string;
  meta?: string;
  right?: React.ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-3 py-2.5 hover:bg-muted/50 -mx-2 px-2 rounded-md transition-colors">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
        </span>
        {right}
      </Link>
    </li>
  );
}

/* ---------------------------------- widgets ---------------------------------- */

async function QualityKpis() {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  // Open change controls lives in the always-on status strip now, so it's left
  // out here to avoid showing the same number twice on one screen.
  const [dueReview, retentionQueue, inFlight, openTraining] = await Promise.all([
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
    { label: "Docs due for review", value: dueReview.count ?? 0, href: "/periodic", icon: CalendarClock },
    { label: "Retention-expiry queue", value: retentionQueue.count ?? 0, href: "/queues/destruction", icon: Flame },
    { label: "In-flight documents", value: inFlight.count ?? 0, href: "/library", icon: FileText },
    { label: "Incomplete training", value: openTraining.count ?? 0, href: "/training", icon: GraduationCap },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <StatCard key={c.label} label={c.label} value={c.value} href={c.href} icon={c.icon} />
      ))}
    </div>
  );
}

async function ApprovalsAttention() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("change_controls")
    .select("id, type, reason, status, created_at")
    .not("status", "in", "(closed,rejected)")
    .order("created_at", { ascending: true })
    .limit(5);
  return (
    <SectionCard title="Changes needing attention" description="Oldest open change controls first.">
      {data?.length ? (
        <RowList>
          {data.map((c) => (
            <Row
              key={c.id}
              href={`/changes/${c.id}`}
              title={c.reason || c.type}
              meta={`Opened ${dateFmt(c.created_at)}`}
              right={<StatusBadge value={c.status} />}
            />
          ))}
        </RowList>
      ) : (
        <EmptyNote text="No open change controls — the pipeline is clear." />
      )}
    </SectionCard>
  );
}

async function PeriodicWorklist() {
  const supabase = await createClient();
  const soon = new Date(Date.now() + 30 * 86400000).toISOString();
  const { data } = await supabase
    .from("documents")
    .select("id, document_number, title, next_review_at")
    .eq("status", "active")
    .lte("next_review_at", soon)
    .order("next_review_at", { ascending: true })
    .limit(5);
  const now = Date.now();
  return (
    <SectionCard title="Periodic review" description="Due within 30 days — overdue first.">
      {data?.length ? (
        <RowList>
          {data.map((d) => (
            <Row
              key={d.id}
              href="/periodic"
              title={d.title}
              meta={d.document_number ?? undefined}
              right={
                <span className={`text-xs tabular-nums ${new Date(d.next_review_at).getTime() < now ? "font-medium text-status-blocked" : "text-muted-foreground"}`}>
                  {new Date(d.next_review_at).getTime() < now ? "Overdue · " : ""}
                  {dateFmt(d.next_review_at)}
                </span>
              }
            />
          ))}
        </RowList>
      ) : (
        <EmptyNote text="Nothing due for periodic review in the next 30 days." />
      )}
    </SectionCard>
  );
}

async function DepartmentOverview() {
  const supabase = await createClient();
  const [{ data: departments }, { data: users }, { data: documents }, { data: changes }] =
    await Promise.all([
      supabase.from("departments").select("id, name").order("name"),
      supabase.from("users").select("id, department_id, status"),
      supabase.from("documents").select("id, department_id, status"),
      supabase.from("change_controls").select("id, department_id, status"),
    ]);
  const inFlightStatuses = new Set(["in_review", "locked_in_cc", "pending_training", "scheduled"]);
  const rows = (departments ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    members: (users ?? []).filter((u) => u.department_id === d.id && u.status === "active").length,
    effective: (documents ?? []).filter((x) => x.department_id === d.id && x.status === "active").length,
    inFlight: (documents ?? []).filter((x) => x.department_id === d.id && inFlightStatuses.has(x.status)).length,
    openChanges: (changes ?? []).filter((c) => c.department_id === d.id && c.status !== "closed" && c.status !== "rejected").length,
  }));
  return (
    <SectionCard title="Department overview" description="The organization at a glance, one row per department.">
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Department</th>
                <th className="py-2 pr-4 text-right font-medium">Members</th>
                <th className="py-2 pr-4 text-right font-medium">Effective docs</th>
                <th className="py-2 pr-4 text-right font-medium">In flight</th>
                <th className="py-2 text-right font-medium">Open changes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-4 font-medium">{r.name}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.members}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.effective}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{r.inFlight}</td>
                  <td className="py-2 text-right tabular-nums">{r.openChanges}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote text="No departments yet." />
      )}
    </SectionCard>
  );
}

type Usage = {
  window_days: number;
  screens: { screen: string; actions: number }[];
  funnel: Record<string, number>;
};

async function UsageInsights() {
  const supabase = await createClient();
  const usage = await supabase.rpc("usage_summary", { p_days: 30 });
  const u = (usage.error ? null : usage.data) as Usage | null;
  if (!u) {
    return (
      <SectionCard title="Usage insights">
        <EmptyNote text="Usage insights are visible to QA and Org-Admins." />
      </SectionCard>
    );
  }
  const funnelRows = [
    { label: "Intakes started → dispatched", a: u.funnel.intakes_started, b: u.funnel.intakes_dispatched },
    { label: "Drafts created → submitted", a: u.funnel.drafts_created, b: u.funnel.drafts_submitted },
    { label: "Changes opened → closed", a: u.funnel.changes_opened, b: u.funnel.changes_closed },
  ];
  return (
    <SectionCard
      title="Usage insights"
      description={`Derived from the audit trail — last ${u.window_days} days.`}
    >
      <div className="grid gap-6 lg:grid-cols-2">
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
        <ul className="space-y-2 text-sm">
          <li className="text-xs font-medium text-muted-foreground">Busiest screens</li>
          {u.screens.slice(0, 8).map((s) => (
            <li key={s.screen} className="flex justify-between gap-4">
              <span className="text-muted-foreground">{s.screen}</span>
              <span className="font-mono tabular-nums">{s.actions}</span>
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  );
}

async function RecentAudit() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_trail")
    .select("id, action, actor_email, occurred_at")
    .order("id", { ascending: false })
    .limit(8);
  // Privacy: this is an org surface — platform actors show as "Platform".
  const platform = await platformEmailSet(supabase, (data ?? []).map((e) => e.actor_email));
  return (
    <SectionCard
      title="Recent activity"
      description="The latest audit-trail entries."
      actions={<Link href="/audit" className="text-xs text-muted-foreground hover:underline">Audit trail →</Link>}
    >
      {data?.length ? (
        <ul className="space-y-2 text-sm">
          {data.map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">
                <span className="font-mono text-xs">{e.action}</span>
                <span className="ml-2 text-xs text-muted-foreground">{maskActor(e.actor_email, platform)}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {new Date(e.occurred_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyNote text="No activity yet." />
      )}
    </SectionCard>
  );
}

async function StorageUsage() {
  const supabase = await createClient();
  const [{ data: files }, { data: limitRow }] = await Promise.all([
    supabase.from("stored_files").select("bytes"),
    supabase.from("tenant_storage_limits").select("max_bytes").maybeSingle(),
  ]);
  const used = (files ?? []).reduce((n, f) => n + (f.bytes ?? 0), 0);
  const limit = limitRow?.max_bytes ?? 1024 * 1024 * 1024; // platform default 1 GB
  const mb = (n: number) => (n / (1024 * 1024)).toFixed(n >= 1024 * 1024 * 100 ? 0 : 1);
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <SectionCard title="Storage" description="SOP files stored against the tenant limit.">
      <div className="space-y-2">
        <Progress value={pct} />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{mb(used)} MB</span>{" "}
          of {mb(limit)} MB used · {(files ?? []).length} file{(files ?? []).length === 1 ? "" : "s"}
        </p>
      </div>
    </SectionCard>
  );
}

async function TrainingPulse() {
  const supabase = await createClient();
  const [assigned, completed] = await Promise.all([
    supabase.from("training_assignments").select("*", { count: "exact", head: true }).neq("status", "completed"),
    supabase.from("training_assignments").select("*", { count: "exact", head: true }).eq("status", "completed"),
  ]);
  const open = assigned.count ?? 0;
  const done = completed.count ?? 0;
  const total = open + done;
  const pct = total ? Math.round((done / total) * 100) : 100;
  return (
    <SectionCard title="Training pulse" description="Completion across every assignment ever made.">
      <div className="space-y-2">
        <Progress value={pct} />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{pct}%</span> complete ·{" "}
          {open} open · {done} completed
        </p>
      </div>
    </SectionCard>
  );
}

async function CopiesOutstanding() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("controlled_copies")
    .select("id, copy_number, issued_at, holder")
    .eq("status", "issued")
    .order("issued_at", { ascending: true })
    .limit(5);
  return (
    <SectionCard
      title="Outstanding controlled copies"
      description="Issued and not yet reconciled — oldest first."
      actions={<Link href="/copies" className="text-xs text-muted-foreground hover:underline">Register →</Link>}
    >
      {data?.length ? (
        <RowList>
          {data.map((c) => (
            <Row
              key={c.id}
              href="/copies"
              title={`Copy ${c.copy_number}`}
              meta={c.holder ?? undefined}
              right={<span className="text-xs tabular-nums text-muted-foreground">{dateFmt(c.issued_at)}</span>}
            />
          ))}
        </RowList>
      ) : (
        <EmptyNote text="Every issued copy is reconciled (or the register is off)." />
      )}
    </SectionCard>
  );
}

async function MyTraining({ ctx }: { ctx: WidgetCtx }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_assignments")
    .select("id, status, due_at, documents(title)")
    .eq("user_id", ctx.userId)
    .neq("status", "completed")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(5);
  return (
    <SectionCard
      title="My training"
      description="Open assignments, soonest due first."
      actions={<Link href="/training" className="text-xs text-muted-foreground hover:underline">All training →</Link>}
    >
      {data?.length ? (
        <RowList>
          {data.map((a) => (
            <Row
              key={a.id}
              href="/training"
              title={(a.documents as unknown as { title: string } | null)?.title ?? "Training assignment"}
              meta={a.due_at ? `Due ${dateFmt(a.due_at)}` : "No due date"}
              right={<StatusBadge value={a.status} />}
            />
          ))}
        </RowList>
      ) : (
        <EmptyNote text="No open training — you're fully current." />
      )}
    </SectionCard>
  );
}

async function MyRequests({ ctx }: { ctx: WidgetCtx }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("intake_requests")
    .select("id, title, status, created_at")
    .eq("requester_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(5);
  return (
    <SectionCard
      title="My requests"
      description="Your intake requests and where they stand."
      actions={<Link href="/intake" className="text-xs text-muted-foreground hover:underline">Start a request →</Link>}
    >
      {data?.length ? (
        <RowList>
          {data.map((r) => (
            <Row
              key={r.id}
              href="/intake"
              title={r.title}
              meta={`Filed ${dateFmt(r.created_at)}`}
              right={<StatusBadge value={r.status} />}
            />
          ))}
        </RowList>
      ) : (
        <EmptyNote text="You haven't filed any requests yet." />
      )}
    </SectionCard>
  );
}

async function DeptDocuments({ ctx }: { ctx: WidgetCtx }) {
  const supabase = await createClient();
  let q = supabase
    .from("documents")
    .select("id, document_number, title, updated_at")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(5);
  if (ctx.departmentId) q = q.eq("department_id", ctx.departmentId);
  const { data } = await q;
  return (
    <SectionCard
      title="My department's documents"
      description="Recently updated effective documents."
      actions={<Link href="/library" className="text-xs text-muted-foreground hover:underline">Library →</Link>}
    >
      {data?.length ? (
        <RowList>
          {data.map((d) => (
            <Row
              key={d.id}
              href={`/documents/${d.id}`}
              title={d.title}
              meta={d.document_number ?? undefined}
              right={<span className="text-xs tabular-nums text-muted-foreground">{dateFmt(d.updated_at)}</span>}
            />
          ))}
        </RowList>
      ) : (
        <EmptyNote text="No effective documents in your department yet." />
      )}
    </SectionCard>
  );
}

async function MyBroadcasts({ ctx }: { ctx: WidgetCtx }) {
  const supabase = await createClient();
  const [{ data: broadcasts }, { data: acks }] = await Promise.all([
    supabase.from("broadcasts").select("id, title, created_at").order("created_at", { ascending: false }).limit(15),
    supabase.from("broadcast_acks").select("broadcast_id").eq("user_id", ctx.userId),
  ]);
  const acked = new Set((acks ?? []).map((a) => a.broadcast_id));
  const pending = (broadcasts ?? []).filter((b) => !acked.has(b.id)).slice(0, 5);
  return (
    <SectionCard
      title="Announcements to acknowledge"
      description="Broadcasts waiting for your acknowledgement — open the Pulse panel to act."
    >
      {pending.length ? (
        <ul className="space-y-2 text-sm">
          {pending.map((b) => (
            <li key={b.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{b.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{dateFmt(b.created_at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyNote text="Nothing awaiting your acknowledgement." />
      )}
    </SectionCard>
  );
}

/* --------------------------------- renderer --------------------------------- */

export async function DashboardWidget({ k, ctx }: { k: string; ctx: WidgetCtx }) {
  switch (k) {
    case "quality_kpis": return <QualityKpis />;
    case "approvals_attention": return <ApprovalsAttention />;
    case "periodic_worklist": return <PeriodicWorklist />;
    case "department_overview": return <DepartmentOverview />;
    case "usage_insights": return <UsageInsights />;
    case "recent_audit": return <RecentAudit />;
    case "storage_usage": return <StorageUsage />;
    case "training_pulse": return <TrainingPulse />;
    case "copies_outstanding": return <CopiesOutstanding />;
    case "my_training": return <MyTraining ctx={ctx} />;
    case "my_requests": return <MyRequests ctx={ctx} />;
    case "dept_documents": return <DeptDocuments ctx={ctx} />;
    case "my_broadcasts": return <MyBroadcasts ctx={ctx} />;
    default: return null; // unknown key — an older config referencing a removed widget
  }
}

export function WidgetSkeleton({ size }: { size: WidgetSize }) {
  return (
    <Card className={`p-6 ${size === "full" ? "lg:col-span-2" : ""}`}>
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 space-y-2.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    </Card>
  );
}
