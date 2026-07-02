import Link from "next/link";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { GraduationCap } from "lucide-react";

type ThresholdStatus = {
  assigned: number;
  completed: number;
  pct: number | null;
  threshold: number;
  met: boolean;
  document_status: string;
};

// T-DASHBOARD (plan §8/§10): per-package progress vs the seam — completion
// rates, who's done / not done, overdue, scores, and how far each package is
// from letting the core release. All reads derive from the assignment/attempt
// records; nothing is counted separately.
export default async function TrainingDashboard() {
  await requireOrgUser();
  const roles = await getMyRoles();
  const isTrainer = roles.includes("qa") || roles.includes("trainer");
  const supabase = await createClient();

  if (!isTrainer) {
    return (
      <main className="mx-auto max-w-4xl space-y-6 p-2">
        <PageHeader title="Training dashboard" />
        <EmptyState icon={GraduationCap} message="Trainer or QA only — your own trainings live under My training." />
      </main>
    );
  }

  const { data: packages } = await supabase
    .from("training_packages")
    .select("id, document_id, state, template_key, created_at")
    .in("state", ["approved", "assigned"])
    .order("created_at", { ascending: false });

  const pkgIds = (packages ?? []).map((p) => p.id);
  const docIds = [...new Set((packages ?? []).map((p) => p.document_id))];

  const [{ data: docs }, { data: assignments }, { data: attempts }, { data: users }, thresholds] =
    await Promise.all([
      docIds.length
        ? supabase.from("documents").select("id, document_number, title").in("id", docIds)
        : Promise.resolve({ data: [] as { id: string; document_number: string | null; title: string }[] }),
      pkgIds.length
        ? supabase
            .from("training_assignments")
            .select("id, package_id, user_id, status, slide_progress_pct, due_at, completed_at")
            .in("package_id", pkgIds)
        : Promise.resolve({ data: [] as never[] }),
      pkgIds.length
        ? supabase.from("assessment_attempts").select("assignment_id, score, passed")
        : Promise.resolve({ data: [] as never[] }),
      supabase.from("users").select("id, email, full_name"),
      Promise.all(
        (pkgIds ?? []).map(async (id) => {
          const { data } = await supabase.rpc("training_threshold_status", { p_package: id });
          return [id, data as ThresholdStatus | null] as const;
        }),
      ),
    ]);

  const thresholdOf = new Map(thresholds);
  const userLabel = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? (u.full_name ?? u.email) : id.slice(0, 8);
  };
  const docLabel = (id: string) => {
    const d = docs?.find((x) => x.id === id);
    return d ? `${d.document_number ?? "—"} · ${d.title}` : id.slice(0, 8);
  };
  type A = NonNullable<typeof assignments>[number];
  const byPackage = new Map<string, A[]>();
  for (const a of (assignments ?? []) as A[]) {
    const list = byPackage.get(a.package_id) ?? [];
    list.push(a);
    byPackage.set(a.package_id, list);
  }
  const attemptsOf = (assignmentId: string) =>
    ((attempts ?? []) as { assignment_id: string; score: number; passed: boolean }[]).filter(
      (x) => x.assignment_id === assignmentId,
    );

  const now = Date.now();

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        title="Training dashboard"
        description="Completion vs the release threshold, per package and per trainee."
        actions={
          <Button variant="outline" asChild>
            <Link href="/training/packages">Packages</Link>
          </Button>
        }
      />

      {(packages ?? []).length === 0 ? (
        <EmptyState icon={GraduationCap} message="No live packages — approved and assigned packages appear here with their threshold status." />
      ) : (
        (packages ?? []).map((p) => {
          const t = thresholdOf.get(p.id) ?? null;
          const rows = byPackage.get(p.id) ?? [];
          const scores = rows
            .flatMap((a) => attemptsOf(a.id).map((x) => Number(x.score)))
            .filter((s) => !Number.isNaN(s));
          const avg = scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10 : null;
          return (
            <SectionCard
              key={p.id}
              title={docLabel(p.document_id)}
              description={`${p.template_key} · ${t?.completed ?? 0}/${t?.assigned ?? 0} completed · threshold ${t?.threshold ?? 100}%${avg != null ? ` · avg score ${avg}%` : ""}`}
            >
              <div className="mb-3 flex items-center gap-3">
                <Progress value={t?.pct ?? 0} className="h-2 flex-1" aria-label="Completion" />
                <Badge variant={t?.met ? "default" : "outline"}>
                  {t?.met
                    ? t?.document_status === "pending_training"
                      ? "Threshold met — ready to release"
                      : "Threshold met"
                    : `${t?.pct ?? 0}% of ${t?.threshold}%`}
                </Badge>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/training/packages/${p.id}`}>Open</Link>
                </Button>
              </div>
              <ul className="divide-y">
                {rows.map((a) => {
                  const overdue = a.status !== "completed" && a.due_at && new Date(a.due_at).getTime() < now;
                  const best = attemptsOf(a.id).reduce<number | null>(
                    (m, x) => (m == null || Number(x.score) > m ? Number(x.score) : m),
                    null,
                  );
                  return (
                    <li key={a.id} className="flex items-center gap-4 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{userLabel(a.user_id)}</span>
                      <Progress value={a.slide_progress_pct} className="h-1.5 w-28" aria-label="Slides" />
                      {best != null && <span className="w-12 text-right tabular-nums text-muted-foreground">{best}%</span>}
                      <StatusBadge value={overdue ? "overdue" : a.status} kind="training" dot />
                    </li>
                  );
                })}
                {rows.length === 0 && (
                  <li className="py-2 text-sm text-muted-foreground">Approved, not yet assigned.</li>
                )}
              </ul>
            </SectionCard>
          );
        })
      )}

      <p className="text-xs text-muted-foreground">
        Full training history per document is exportable from the audit trail (document story CSV) —
        assignments, attempts, approvals and AI provenance included.
      </p>
    </main>
  );
}
