import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollText } from "lucide-react";
import { columns, type AuditRow } from "./columns";
import { ExportMenu } from "./export-menu";

// S-AUDIT — the read-only, sortable, filterable audit viewer. RLS scopes what's
// visible: org QA sees only their org's trail; platform admins reach a tenant's
// trail only through an open break-glass session. The screen you open for an auditor.
export default async function AuditViewer({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entity?: string; from?: string; to?: string; tenant?: string }>;
}) {
  const user = await requireUser();
  const f = await searchParams;
  const supabase = await createClient();

  // Platform viewing a specific tenant logs the access on that tenant's trail.
  if (user.plane === "platform" && f.tenant) {
    await supabase.rpc("log_platform_view", { p_tenant: f.tenant, p_what: "audit trail" });
  }

  let q = supabase
    .from("audit_trail")
    .select("id, occurred_at, actor_email, action, entity_type, entity_id, tenant_id, reason, old_value, new_value")
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (f.action) q = q.ilike("action", `%${f.action}%`);
  if (f.entity) q = q.eq("entity_id", f.entity);
  if (f.from) q = q.gte("occurred_at", f.from);
  if (f.to) q = q.lte("occurred_at", f.to);
  if (f.tenant) q = q.eq("tenant_id", f.tenant);
  const { data: rows } = await q;

  // Documents for the "Document story…" export picker (RLS-scoped, same as elsewhere).
  const { data: docs } = await supabase
    .from("documents")
    .select("id, document_number, title")
    .order("document_number");

  const qs = new URLSearchParams(f as Record<string, string>).toString();

  const data: AuditRow[] = (rows ?? []).map((r) => ({
    id: String(r.id),
    time: r.occurred_at,
    actor: r.actor_email ?? "—",
    action: r.action,
    entityType: r.entity_type ?? "",
    entityId: r.entity_id ? String(r.entity_id) : null,
    reason: r.reason,
    oldValue: r.old_value,
    newValue: r.new_value,
  }));

  const documents = (docs ?? []).map((d) => ({
    id: d.id,
    number: d.document_number ?? "—",
    title: d.title,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Audit trail"
        description="Read-only, hash-chained record of every controlled action in scope."
        actions={<ExportMenu qs={qs} documents={documents} />}
      />

      <form className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="action" className="text-xs text-muted-foreground">Action contains</Label>
          <Input id="action" name="action" defaultValue={f.action} placeholder="e.g. approve" className="h-9 w-44" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="entity" className="text-xs text-muted-foreground">Entity id</Label>
          <Input id="entity" name="entity" defaultValue={f.entity} placeholder="exact id" className="h-9 w-44" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="from" className="text-xs text-muted-foreground">From</Label>
          <Input id="from" name="from" type="date" defaultValue={f.from} className="h-9 w-40" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="to" className="text-xs text-muted-foreground">To</Label>
          <Input id="to" name="to" type="date" defaultValue={f.to} className="h-9 w-40" />
        </div>
        {user.plane === "platform" && (
          <div className="grid gap-1">
            <Label htmlFor="tenant" className="text-xs text-muted-foreground">Tenant id</Label>
            <Input id="tenant" name="tenant" defaultValue={f.tenant} placeholder="via open gate" className="h-9 w-44" />
          </div>
        )}
        <Button type="submit" size="sm">Filter</Button>
      </form>

      <DataTable
        columns={columns}
        data={data}
        searchKey="action"
        searchPlaceholder="Search action…"
        emptyState={
          <EmptyState icon={ScrollText} message="No audit entries match the current filter." />
        }
      />
    </div>
  );
}
