import Link from "next/link";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ModuleOffAlert } from "@/components/app/module-off-alert";
import { ActionForm } from "@/app/_components/ActionForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap } from "lucide-react";
import { GeneratePackageDialog } from "./generate-dialog";
import { saveTrainingSettings } from "../actions";

type Candidate = {
  document_id: string;
  number: string | null;
  title: string;
  status: string;
  version_id: string;
  revision: number | null;
  reason_for_change: string | null;
  has_open_package: boolean;
};

// T-PACKAGES — training packages per document version (plan §10). Generate
// (template + question count + grounding text), review drafts, assign; QA-owned
// settings live here too. Every state change is server-guarded.
export default async function TrainingPackages() {
  await requireOrgUser();
  const roles = await getMyRoles();
  const isTrainer = roles.includes("qa") || roles.includes("trainer");
  const supabase = await createClient();

  const [{ data: mod }, { data: candidatesRaw }, { data: packages }, { data: settings }] =
    await Promise.all([
      supabase.from("tenant_modules").select("enabled").eq("module_key", "training").maybeSingle(),
      supabase.rpc("training_candidates"),
      supabase
        .from("training_packages")
        .select("id, document_id, document_version_id, template_key, question_count, pass_mark, state, created_at, approved_at")
        .neq("state", "closed")
        .order("created_at", { ascending: false }),
      supabase.from("training_settings").select("pass_mark, max_attempts, default_due_days").maybeSingle(),
    ]);
  const { data: aiUsage } = await supabase.rpc("ai_usage_summary", { p_days: 30 });
  const aiTotals = (aiUsage as { totals?: { calls?: number; total_tokens?: number } } | null)?.totals;

  const candidates = ((candidatesRaw as Candidate[] | null) ?? []).filter((c) => !c.has_open_package);
  const docIds = [...new Set((packages ?? []).map((p) => p.document_id))];
  const { data: docs } = docIds.length
    ? await supabase.from("documents").select("id, document_number, title").in("id", docIds)
    : { data: [] as { id: string; document_number: string | null; title: string }[] };
  const docLabel = (id: string) => {
    const d = docs?.find((x) => x.id === id);
    return d ? `${d.document_number ?? "—"} · ${d.title}` : id.slice(0, 8);
  };

  if (!isTrainer) {
    return (
      <main className="mx-auto max-w-4xl space-y-6 p-2">
        <PageHeader title="Training packages" />
        <EmptyState
          icon={GraduationCap}
          message="Trainer or QA only — training packages are prepared and approved by trainers and QA. Your own trainings live under My training."
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        title="Training packages"
        description="AI drafts from the controlled document; a trainer reviews and approves before anything reaches a trainee."
        actions={
          <Button variant="outline" asChild>
            <Link href="/training/dashboard">Dashboard</Link>
          </Button>
        }
      />
      {mod?.enabled === false && (
        <ModuleOffAlert module="Training" detail="Packages cannot be created while the core runs on its safe default (no training gate)." />
      )}

      <SectionCard
        title="Needs a package"
        description="Documents at the training gate (and active documents for refreshers). Generation is grounded strictly in the document's content."
      >
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing is waiting for a training package.
          </p>
        ) : (
          <ul className="divide-y">
            {candidates.map((c) => (
              <li key={c.version_id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{c.number ?? "—"}</span>
                    <StatusBadge value={c.status} kind="document" dot />
                  </div>
                  <p className="truncate font-medium">{c.title}</p>
                </div>
                <GeneratePackageDialog candidate={c} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Open packages">
        {(packages ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No open packages.</p>
        ) : (
          <ul className="divide-y">
            {(packages ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{docLabel(p.document_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.template_key} · {p.question_count} questions
                    {p.pass_mark ? ` · pass ${p.pass_mark}%` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge value={p.state} kind="training" />
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/training/packages/${p.id}`}>
                      {p.state === "draft_review" ? "Review" : "Open"}
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Training settings"
        description="QA-ratified configuration: 'completed' means 'passed' at this mark."
      >
        <ActionForm action={saveTrainingSettings} submitLabel="Save settings">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="pass_mark">Pass mark (%)</Label>
              <Input id="pass_mark" name="pass_mark" type="number" min={1} max={100}
                defaultValue={settings?.pass_mark ?? 80} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max_attempts">Max attempts</Label>
              <Input id="max_attempts" name="max_attempts" type="number" min={1}
                defaultValue={settings?.max_attempts ?? ""} placeholder="unlimited" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default_due_days">Due in (days)</Label>
              <Input id="default_due_days" name="default_due_days" type="number" min={1} max={365}
                defaultValue={settings?.default_due_days ?? 14} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Every attempt is recorded and never overwritten. Threshold % is platform switchboard
            configuration; ask via <Badge variant="outline">Modules</Badge> if it needs changing.
            {aiTotals && (
              <>
                {" "}AI usage (30d): {aiTotals.calls ?? 0} calls ·{" "}
                {(aiTotals.total_tokens ?? 0).toLocaleString()} tokens — metered on the provenance log.
              </>
            )}
          </p>
        </ActionForm>
      </SectionCard>
    </main>
  );
}
