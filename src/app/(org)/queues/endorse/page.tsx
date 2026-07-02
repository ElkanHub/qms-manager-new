import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EndorseTable, type EndorseRow } from "./endorse-table";

// D-ENDORSE — HOD endorsement queue. Employee submissions awaiting this HOD.
// Endorse is disabled for the viewer's own submissions (an author never endorses
// their own document); the server enforces SoD regardless.
export default async function EndorseQueue() {
  const me = await requireOrgUser();
  const isHOD = (await getMyRoles()).includes("hod");
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("approval_requests")
    .select("id, document_id, submitted_by, version_id")
    .eq("stage", "hod_review")
    .eq("status", "pending")
    .order("created_at");

  const docIds = [...new Set((requests ?? []).map((r) => r.document_id))];
  const versionIds = [...new Set((requests ?? []).map((r) => r.version_id))];
  const authorIds = [...new Set((requests ?? []).map((r) => r.submitted_by))];

  const [{ data: docs }, { data: versions }, { data: users }] = await Promise.all([
    docIds.length
      ? supabase.from("documents").select("id, document_number, title").in("id", docIds)
      : Promise.resolve({ data: [] as { id: string; document_number: string | null; title: string }[] }),
    versionIds.length
      ? supabase
          .from("document_versions")
          .select("id, content_ref, reason_for_change")
          .in("id", versionIds)
      : Promise.resolve({ data: [] as { id: string; content_ref: string | null; reason_for_change: string | null }[] }),
    authorIds.length
      ? supabase.from("users").select("id, full_name, email").in("id", authorIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
  ]);

  const docOf = (id: string) => docs?.find((d) => d.id === id);
  const versionOf = (id: string) => versions?.find((v) => v.id === id);
  const authorOf = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? (u.full_name ?? u.email) : id;
  };

  const rows: EndorseRow[] = (requests ?? []).map((r) => {
    const d = docOf(r.document_id);
    const v = versionOf(r.version_id);
    return {
      id: r.id,
      number: d?.document_number ?? "—",
      title: d?.title ?? r.document_id,
      author: authorOf(r.submitted_by),
      reason: v?.reason_for_change ?? null,
      contentRef: v?.content_ref ?? null,
      mine: r.submitted_by === me.id,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Endorsements"
        description="Submissions from your department awaiting your endorsement."
      />
      {!isHOD && (
        <Alert>
          <AlertDescription>Only department heads endorse submissions.</AlertDescription>
        </Alert>
      )}
      <EndorseTable rows={rows} />
    </div>
  );
}
