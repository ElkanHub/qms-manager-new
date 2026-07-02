import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { Copy } from "lucide-react";
import { columns, type CopyRow } from "./columns";
import { IssueCopyDialog } from "./issue-copy-dialog";

// D-COPIES — the controlled-copy register (QA). Issue copies against a document's
// effective version and reconcile them; this feeds the change pipe's reconciliation.
export default async function Copies() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();

  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, document_number, current_version_id")
    .eq("status", "active")
    .order("document_number");
  const { data: copies } = await supabase
    .from("controlled_copies")
    .select("id, document_version_id, copy_number, holder, status, reconciled_method, issued_at")
    .order("issued_at", { ascending: false });

  // map version → document (no declared FK join; mirror the master-index pattern)
  const versionIds = [...new Set((copies ?? []).map((c) => c.document_version_id))];
  const { data: versions } = versionIds.length
    ? await supabase.from("document_versions").select("id, document_id").in("id", versionIds)
    : { data: [] as { id: string; document_id: string }[] };
  const docLabel = (versionId: string) => {
    const dvId = versions?.find((v) => v.id === versionId)?.document_id;
    const d = docs?.find((x) => x.id === dvId);
    return d ? `${d.document_number ?? "—"} · ${d.title}` : versionId;
  };

  const rows: CopyRow[] = (copies ?? []).map((c) => ({
    id: c.id,
    copyNumber: `#${c.copy_number}`,
    document: docLabel(c.document_version_id),
    holder: c.holder,
    issuedDate: c.issued_at ? new Date(c.issued_at).toLocaleDateString() : "—",
    status: c.status,
    method: c.reconciled_method ?? null,
    canReconcile: isQA && c.status === "issued",
  }));

  const issueOptions = (docs ?? [])
    .filter((d) => d.current_version_id)
    .map((d) => ({
      versionId: d.current_version_id!,
      label: `${d.document_number ?? "—"} · ${d.title}`,
    }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Controlled copies"
        description="Issued controlled copies and their reconciliation status."
        actions={isQA ? <IssueCopyDialog options={issueOptions} /> : undefined}
      />
      <DataTable
        columns={columns}
        data={rows}
        facets={[{ columnId: "status", title: "Status" }]}
        emptyState={
          <EmptyState
            icon={Copy}
            message="No controlled copies issued — use Issue copy to register a physical/controlled distribution."
          />
        }
      />
    </div>
  );
}
