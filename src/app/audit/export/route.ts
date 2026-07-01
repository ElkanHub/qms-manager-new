import { createClient } from "@/lib/supabase/server";

// Read-only CSV export for inspectors. RLS scopes rows exactly as the viewer does.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const f = Object.fromEntries(url.searchParams);
  const supabase = await createClient();

  let q = supabase
    .from("audit_trail")
    .select("occurred_at, actor_email, action, entity_type, entity_id, tenant_id, reason")
    .order("occurred_at", { ascending: false })
    .limit(5000);
  if (f.action) q = q.ilike("action", `%${f.action}%`);
  if (f.from) q = q.gte("occurred_at", f.from);
  if (f.to) q = q.lte("occurred_at", f.to);
  if (f.tenant) q = q.eq("tenant_id", f.tenant);
  const { data: rows } = await q;

  const cols = ["occurred_at", "actor_email", "action", "entity_type", "entity_id", "tenant_id", "reason"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...(rows ?? []).map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(","))].join("\n");

  return new Response(csv, {
    headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="audit.csv"' },
  });
}
