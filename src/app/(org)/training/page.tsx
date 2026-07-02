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
import { Award, Download, GraduationCap } from "lucide-react";

type Row = {
  assignment_id: string;
  status: string;
  progress_pct: number;
  due_at: string | null;
  assigned_at: string;
  completed_at: string | null;
  overdue: boolean;
  document_number: string | null;
  document_title: string;
  revision: number | null;
  package_id: string | null;
  certificate_uid: string | null;
  score: number | null;
};

// T-MY-TRAINING (plan §10): the trainee's home — assignments with progress
// bars, due dates, scores, and the certificate archive.
export default async function MyTraining() {
  await requireOrgUser();
  const roles = await getMyRoles();
  const isTrainer = roles.includes("qa") || roles.includes("trainer");
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_training");
  const rows = ((data as Row[] | null) ?? []);

  const open = rows.filter((r) => r.status !== "completed");
  const done = rows.filter((r) => r.status === "completed");

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-2">
      <PageHeader
        title="My training"
        description="Your assigned trainings, progress and certificates."
        actions={
          isTrainer ? (
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href="/training/packages">Packages</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/training/dashboard">Dashboard</Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      <SectionCard title="Assigned to you">
        {open.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            message="Nothing assigned — trainings assigned to you appear here with a progress bar and due date."
          />
        ) : (
          <ul className="divide-y">
            {open.map((r) => (
              <li key={r.assignment_id} className="flex items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{r.document_number ?? "—"}</span>
                    <StatusBadge value={r.overdue ? "overdue" : r.status} kind="training" dot />
                  </div>
                  <p className="truncate font-medium">{r.document_title}</p>
                  <div className="mt-1 flex items-center gap-3">
                    <Progress value={r.progress_pct} className="h-1.5 w-40" aria-label="Slide progress" />
                    <span className="text-xs tabular-nums text-muted-foreground">{r.progress_pct}%</span>
                    {r.due_at && (
                      <span className="text-xs text-muted-foreground">
                        due {new Date(r.due_at).toISOString().slice(0, 10)}
                      </span>
                    )}
                  </div>
                </div>
                {r.package_id ? (
                  <Button size="sm" asChild>
                    <Link href={`/training/learn/${r.assignment_id}`}>
                      {r.status === "assigned" ? "Start" : "Resume"}
                    </Link>
                  </Button>
                ) : (
                  <Badge variant="outline">recorded manually</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Completed — certificate archive">
        {done.length === 0 ? (
          <p className="text-sm text-muted-foreground">Passed trainings and their certificates land here.</p>
        ) : (
          <ul className="divide-y">
            {done.map((r) => (
              <li key={r.assignment_id} className="flex items-center gap-4 py-3">
                <Award className="size-4 text-status-effective" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {r.document_number ?? "—"} · {r.document_title}
                    {r.revision != null && (
                      <span className="text-muted-foreground"> · rev {String(r.revision).padStart(2, "0")}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.completed_at ? new Date(r.completed_at).toISOString().slice(0, 10) : ""}
                    {r.score != null && ` · ${r.score}%`}
                  </p>
                </div>
                {r.certificate_uid && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/training/certificates/${r.certificate_uid}`} download>
                      <Download /> PDF
                    </a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </main>
  );
}
