import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { RetirementsTable, type RetirementRow } from "./retirements-table";

// D-RETIRE-REVIEW — QA reviews retirement requests. Approval enforces the pre-checks
// (surfaced in the sheet); once approved, QA withdraws from use, starting the
// retention hold. Server logic unchanged; UI is the DataTable + per-row Sheet grammar.
export default async function Retirements() {
  await requireOrgUser();
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("retirements")
    .select("id, document_id, status, justification, precheck_results")
    .in("status", ["retirement_requested", "retirement_approved"])
    .order("created_at", { ascending: false });
  const { data: docs } = await supabase.from("documents").select("id, title, document_number");

  const docOf = (id: string) => docs?.find((x) => x.id === id);
  const data: RetirementRow[] = (rows ?? []).map((r) => {
    const d = docOf(r.document_id);
    return {
      id: r.id,
      number: d?.document_number ?? "—",
      title: d?.title ?? r.document_id,
      status: r.status,
      justification: r.justification,
      precheck: (r.precheck_results ?? {}) as Record<string, unknown>,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Retirements"
        description="Retirement requests awaiting QA pre-checks and approval."
      />
      <RetirementsTable rows={data} />
    </div>
  );
}
