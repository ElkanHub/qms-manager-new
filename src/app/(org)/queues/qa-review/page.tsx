import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QaReviewTable, type QaReviewRow } from "./qa-review-table";

// D-QA-REVIEW — QA review/approval queue. Approve (with training + effective date),
// request changes, or reject (reason required). Approve is disabled for the viewer's
// own submissions (SoD: QA != author/submitter); the server enforces it regardless.
export default async function QaReviewQueue() {
  const me = await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("approval_requests")
    .select("id, document_id, submitted_by")
    .eq("stage", "qa_review")
    .eq("status", "pending")
    .order("created_at");
  const ids = [...new Set((requests ?? []).map((r) => r.document_id))];
  const { data: docs } = ids.length
    ? await supabase.from("documents").select("id, document_number, title").in("id", ids)
    : { data: [] };
  const docOf = (id: string) => docs?.find((d) => d.id === id);

  const rows: QaReviewRow[] = (requests ?? []).map((r) => {
    const d = docOf(r.document_id);
    return {
      id: r.id,
      documentId: r.document_id,
      number: d?.document_number ?? "—",
      title: d?.title ?? r.document_id,
      submittedBy: r.submitted_by,
      mine: r.submitted_by === me.id,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="QA review"
        description="Drafts awaiting your approval. You cannot approve your own submissions (segregation of duties)."
      />
      {!isQA && (
        <Alert>
          <AlertDescription>Only QA approves documents.</AlertDescription>
        </Alert>
      )}
      <QaReviewTable rows={rows} />
    </div>
  );
}
