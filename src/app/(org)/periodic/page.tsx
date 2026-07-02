import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { ModuleOffAlert } from "@/components/app/module-off-alert";
import { columns, type PeriodicRow } from "./columns";
import { CalendarClock } from "lucide-react";

// D-PERIODIC — periodic review queue. The core always stores next-review dates; this
// module surfaces due/overdue items. Concluding "revise" raises a change request.
export default async function Periodic() {
  await requireOrgUser();
  const supabase = await createClient();

  const { data: mod } = await supabase
    .from("tenant_modules").select("enabled").eq("module_key", "periodic_review").maybeSingle();
  const surfacing = mod?.enabled ?? false;

  if (!surfacing) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-2">
        <PageHeader
          title="Periodic review"
          description="Effective documents with upcoming or overdue review dates."
        />
        <ModuleOffAlert module="Periodic review" />
      </div>
    );
  }

  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, document_number, next_review_at")
    .eq("status", "active")
    .order("next_review_at", { ascending: true });
  const now = Date.now();

  const rows: PeriodicRow[] = (docs ?? []).map((d) => ({
    id: d.id,
    number: d.document_number ?? "—",
    title: d.title,
    due: d.next_review_at ? new Date(d.next_review_at).toISOString().slice(0, 10) : "—",
    overdue: !!d.next_review_at && new Date(d.next_review_at).getTime() <= now,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Periodic review"
        description="Effective documents with upcoming or overdue review dates."
      />
      <DataTable
        columns={columns}
        data={rows}
        searchKey="document"
        searchPlaceholder="Search number or title…"
        emptyState={
          <EmptyState
            icon={CalendarClock}
            message="No documents are due for review — active documents appear here as their review dates approach."
          />
        }
      />
    </div>
  );
}
