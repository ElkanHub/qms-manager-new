import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// S-AUDIT — the read-only, sortable, filterable audit viewer. RLS scopes what's
// visible: org QA sees only their org's trail; platform admins reach a tenant's
// trail only through an open break-glass session. The screen you open for an auditor.
export default async function AuditViewer({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; from?: string; to?: string; tenant?: string }>;
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
    .select("id, occurred_at, actor_email, action, entity_type, entity_id, tenant_id, reason")
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (f.action) q = q.ilike("action", `%${f.action}%`);
  if (f.from) q = q.gte("occurred_at", f.from);
  if (f.to) q = q.lte("occurred_at", f.to);
  if (f.tenant) q = q.eq("tenant_id", f.tenant);
  const { data: rows } = await q;

  const qs = new URLSearchParams(f as Record<string, string>).toString();

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit trail</h1>
        <a href={`/audit/export?${qs}`} className="text-sm underline">Export CSV</a>
      </div>

      <form className="mt-4 flex flex-wrap gap-2 text-sm">
        <input name="action" defaultValue={f.action} placeholder="action contains…"
          className="rounded-md border border-neutral-300 px-3 py-1.5" />
        <input name="from" type="date" defaultValue={f.from}
          className="rounded-md border border-neutral-300 px-3 py-1.5" />
        <input name="to" type="date" defaultValue={f.to}
          className="rounded-md border border-neutral-300 px-3 py-1.5" />
        {user.plane === "platform" && (
          <input name="tenant" defaultValue={f.tenant} placeholder="tenant id (via open gate)"
            className="rounded-md border border-neutral-300 px-3 py-1.5" />
        )}
        <button className="rounded-md bg-neutral-900 px-3 py-1.5 font-medium text-white">Filter</button>
      </form>

      <table className="mt-4 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-2">When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.id} className="border-b border-neutral-100">
              <td className="py-1.5 whitespace-nowrap">{new Date(r.occurred_at).toISOString().replace("T", " ").slice(0, 19)}</td>
              <td>{r.actor_email ?? "—"}</td>
              <td className="font-medium">{r.action}</td>
              <td>{r.entity_type}{r.entity_id ? `:${String(r.entity_id).slice(0, 8)}` : ""}</td>
              <td>{r.reason ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows?.length && <p className="mt-4 text-sm text-neutral-500">No entries in scope.</p>}
    </main>
  );
}
