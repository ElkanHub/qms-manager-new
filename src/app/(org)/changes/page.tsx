import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { columns, type ChangeRow } from "./columns";
import { GitPullRequestArrow } from "lucide-react";

// Native relative time — "3 days ago". No dep.
function relTime(target: number, now: number): string {
  const diff = target - now;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const year = 31_536_000_000,
    month = 2_592_000_000,
    day = 86_400_000;
  const abs = Math.abs(diff);
  if (abs >= year) return rtf.format(Math.round(diff / year), "year");
  if (abs >= month) return rtf.format(Math.round(diff / month), "month");
  return rtf.format(Math.round(diff / day), "day");
}

// D-CHANGE list — change controls, RLS-scoped (QA sees all; others see own).
// Opens the workstation for each.
export default async function Changes() {
  await requireOrgUser();
  const supabase = await createClient();

  const { data: changes } = await supabase
    .from("change_controls")
    .select("id, type, classification, status, requester_id, created_at")
    .order("created_at", { ascending: false });

  const ccIds = (changes ?? []).map((c) => c.id);
  const requesterIds = [...new Set((changes ?? []).map((c) => c.requester_id))];

  // Doc-count lookup: affected documents per change → their document numbers.
  const [{ data: ccDocs }, { data: users }] = await Promise.all([
    ccIds.length
      ? supabase
          .from("change_control_documents")
          .select("change_control_id, document_id")
          .in("change_control_id", ccIds)
      : Promise.resolve({ data: [] as { change_control_id: string; document_id: string }[] }),
    requesterIds.length
      ? supabase.from("users").select("id, full_name, email").in("id", requesterIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
  ]);

  const docIds = [...new Set((ccDocs ?? []).map((d) => d.document_id))];
  const { data: docs } = docIds.length
    ? await supabase.from("documents").select("id, document_number").in("id", docIds)
    : { data: [] as { id: string; document_number: string | null }[] };

  const numberOf = (id: string) => docs?.find((d) => d.id === id)?.document_number ?? "—";
  const requesterOf = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? (u.full_name ?? u.email) : id;
  };

  const now = Date.now();
  const rows: ChangeRow[] = (changes ?? []).map((c) => ({
    id: c.id,
    shortId: c.id.slice(0, 8),
    type: c.type,
    classification: c.classification ?? "—",
    status: c.status,
    docs: (ccDocs ?? [])
      .filter((d) => d.change_control_id === c.id)
      .map((d) => numberOf(d.document_id)),
    requestedBy: requesterOf(c.requester_id),
    age: relTime(new Date(c.created_at).getTime(), now),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader title="Change controls" />
      <DataTable
        columns={columns}
        data={rows}
        facets={[
          { columnId: "status", title: "Status" },
          { columnId: "classification", title: "Class" },
        ]}
        rowHrefBase="/changes"
        emptyState={
          <EmptyState
            icon={GitPullRequestArrow}
            message="No change controls — raise one from a document's 'Request a change'."
          />
        }
      />
    </div>
  );
}
