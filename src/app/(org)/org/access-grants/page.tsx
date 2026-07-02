import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { columns, type AccessRow } from "./columns";
import { KeyRound } from "lucide-react";

// S-ACCESS-GRANT — the org's control point over break-glass. In consent mode
// (org_approved), QA approves/denies a platform admin's access request with a
// required reason. RLS scopes the query to the caller's tenant automatically.
export default async function AccessGrants() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();
  const { data: requests } = await supabase
    .from("access_requests")
    .select("id, purpose, mode, status, requested_at")
    .order("requested_at", { ascending: false });

  const rows: AccessRow[] = (requests ?? []).map((r) => ({
    id: r.id,
    purpose: r.purpose,
    mode: r.mode,
    status: r.status,
    requested_at: r.requested_at,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Access grants"
        description="Platform break-glass requests targeting your organization."
      />
      <DataTable
        columns={columns(isQA)}
        data={rows}
        searchKey="request"
        searchPlaceholder="Search purpose…"
        facets={[{ columnId: "status", title: "Status" }]}
        emptyState={
          <EmptyState
            icon={KeyRound}
            message="No access requests — platform break-glass requests to your org appear here for approval."
          />
        }
      />
    </div>
  );
}
