import { requirePlatformUser, getPlatformIdentity } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { columns, type TenantRow } from "./columns";
import { Building2 } from "lucide-react";

// S-PLATFORM-HOME — the platform operator's landing surface. Cross-tenant metadata
// (the tenant list) is platform oversight — NOT tenant controlled data (§4.3). Platform
// nav lives in the sidebar, so this page is just the header + tenant table.
export default async function PlatformHome() {
  await requirePlatformUser();
  const { isOwner } = await getPlatformIdentity();
  const admin = createAdminClient();
  const [{ data: tenants }, { data: files }, { data: limits }] = await Promise.all([
    admin.from("tenants").select("id, name, status, created_at").order("created_at"),
    admin.from("stored_files").select("tenant_id, bytes"),
    admin.from("tenant_storage_limits").select("tenant_id, max_bytes"),
  ]);
  const usedBy = (id: string) =>
    (files ?? []).filter((f) => f.tenant_id === id).reduce((a, f) => a + Number(f.bytes), 0);
  const limitOf = (id: string) =>
    Number(limits?.find((l) => l.tenant_id === id)?.max_bytes ?? 1073741824);

  const rows: TenantRow[] = (tenants ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    created: new Date(t.created_at).toISOString().slice(0, 10),
    storageUsedBytes: usedBy(t.id),
    storageLimitBytes: limitOf(t.id),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Tenants"
        description={
          isOwner
            ? "Every provisioned tenant — platform oversight metadata, not tenant data."
            : "Provisioned tenants in your scope — platform oversight metadata, not tenant data."
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        searchKey="name"
        searchPlaceholder="Search tenants…"
        facets={[{ columnId: "status", title: "Status" }]}
        emptyState={
          <EmptyState
            icon={Building2}
            message="No tenants provisioned yet — use Provision to create one."
          />
        }
      />
    </div>
  );
}
