import Link from "next/link";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { ModuleOffAlert } from "@/components/app/module-off-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Copy, Download, TriangleAlert } from "lucide-react";
import { columns, type CopyRow } from "./columns";
import { IssueCopyDialog } from "./issue-copy-dialog";

// D-COPIES — the controlled-copy register (QA). Issue copies against a document's
// effective version and reconcile them; this feeds the change pipe's reconciliation
// and the retirement pre-check. Module off → no NEW copies can be issued, but the
// register stays readable and reconcilable (paper already out there never orphans).
export default async function Copies() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();

  const { data: mod } = await supabase
    .from("tenant_modules")
    .select("enabled")
    .eq("module_key", "controlled_copies")
    .maybeSingle();
  const moduleOn = mod?.enabled ?? false;

  const { data: copies } = await supabase
    .from("controlled_copies")
    .select(
      "id, document_version_id, copy_number, holder, purpose, status, reconciled_method, reconciled_note, issued_at",
    )
    .order("issued_at", { ascending: false });

  // version → document lookups cover EVERY copy (superseded/retired documents
  // included — those are exactly the copies that matter most).
  const versionIds = [...new Set((copies ?? []).map((c) => c.document_version_id))];
  const { data: versions } = versionIds.length
    ? await supabase.from("document_versions").select("id, document_id, status").in("id", versionIds)
    : { data: [] as { id: string; document_id: string; status: string }[] };
  const docIds = [...new Set((versions ?? []).map((v) => v.document_id))];
  const { data: docs } = docIds.length
    ? await supabase.from("documents").select("id, title, document_number, status").in("id", docIds)
    : { data: [] as { id: string; title: string; document_number: string | null; status: string }[] };

  const rows: CopyRow[] = (copies ?? []).map((c) => {
    const v = versions?.find((x) => x.id === c.document_version_id);
    const d = docs?.find((x) => x.id === v?.document_id);
    const recallDue =
      c.status === "issued" && (v?.status !== "effective" || d?.status === "retired");
    return {
      id: c.id,
      copyNumber: `#${c.copy_number}`,
      document: d ? `${d.document_number ?? "—"} · ${d.title}` : c.document_version_id,
      holder: c.holder,
      purpose: c.purpose ?? null,
      issuedDate: c.issued_at ? new Date(c.issued_at).toLocaleDateString() : "—",
      status: c.status,
      method: c.reconciled_method ?? null,
      note: c.reconciled_note ?? null,
      recallDue,
      canReconcile: isQA && c.status === "issued",
    };
  });
  const recallCount = rows.filter((r) => r.recallDue).length;

  // Issue against active documents' effective versions only.
  const { data: activeDocs } = await supabase
    .from("documents")
    .select("id, title, document_number, current_version_id")
    .eq("status", "active")
    .order("document_number");
  const issueOptions = (activeDocs ?? [])
    .filter((d) => d.current_version_id)
    .map((d) => ({
      versionId: d.current_version_id!,
      label: `${d.document_number ?? "—"} · ${d.title}`,
    }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Controlled copies"
        description="The register of issued controlled copies and their reconciliation status."
        actions={
          <div className="flex items-center gap-2">
            {rows.length > 0 && (
              <Button variant="outline" asChild>
                <Link href="/copies/export">
                  <Download />
                  Export register
                </Link>
              </Button>
            )}
            {isQA && moduleOn && <IssueCopyDialog options={issueOptions} />}
          </div>
        }
      />

      {!moduleOn && (
        <ModuleOffAlert
          module="Controlled-copy register"
          detail="No new copies can be issued while the module is off. Copies already on the register stay visible and can still be reconciled — outstanding paper is never orphaned."
        />
      )}

      {recallCount > 0 && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>
            {recallCount} {recallCount === 1 ? "copy is" : "copies are"} due for recall
          </AlertTitle>
          <AlertDescription>
            The version they were issued against is no longer effective. Retrieve each copy and
            reconcile it (returned / destroyed — or lost, with a documented note).
          </AlertDescription>
        </Alert>
      )}

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
