import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { columns, type MasterRow } from "./columns";
import { FileText } from "lucide-react";

// D-MASTER-INDEX — the tenant-wide, unscoped, filterable list of ALL effective SOPs.
// Any effective SOP is openable for full read company-wide (A.4) — cross-department
// reference is the point. Lists only effective versions (never in-flight).
export default async function MasterIndex() {
  await requireOrgUser();
  const supabase = await createClient();

  const [{ data: docs }, { data: departments }] = await Promise.all([
    supabase
      .from("documents")
      .select("id, document_number, title, department_id")
      .eq("status", "active")
      .order("document_number"),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  const nameOf = (id: string | null) => departments?.find((d) => d.id === id)?.name ?? "—";
  const rows: MasterRow[] = (docs ?? []).map((d) => ({
    id: d.id,
    number: d.document_number ?? "—",
    title: d.title,
    department: nameOf(d.department_id),
    status: "active",
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Master Index"
        description="Every effective document in the organization — cross-department read is by design."
      />
      <DataTable
        columns={columns}
        data={rows}
        searchKey="document"
        searchPlaceholder="Search number or title…"
        facets={[{ columnId: "department", title: "Department" }]}
        onRowHref={(r) => `/documents/${r.id}`}
        emptyState={
          <EmptyState
            icon={FileText}
            message="No effective documents yet. Documents appear here once a version becomes effective."
          />
        }
      />
    </div>
  );
}
