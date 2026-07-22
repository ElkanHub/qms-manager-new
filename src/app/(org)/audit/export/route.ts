import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { platformEmailSet, maskActor } from "@/lib/audit-actor";

// Read-only CSV export for inspectors. RLS scopes rows exactly as the viewer does.
// ?document=<id> exports one document's complete journey (versions, changes,
// retirement, copies) in chain order via the document_story RPC — the audit story.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const f = Object.fromEntries(url.searchParams);
  const user = await requireUser();
  const supabase = await createClient();

  const cols = ["occurred_at", "actor_email", "action", "entity_type", "entity_id", "tenant_id", "reason", "source"];

  let rows: Record<string, unknown>[] | null;
  if (f.document) {
    const { data } = await supabase.rpc("document_story", { p_document: f.document });
    rows = data;
  } else {
    let q = supabase
      .from("audit_trail")
      .select(cols.join(", "))
      .order("occurred_at", { ascending: false })
      .limit(5000);
    if (f.action) q = q.ilike("action", `%${f.action}%`);
    if (f.entity) q = q.eq("entity_id", f.entity);
    if (f.entity_type) q = q.eq("entity_type", f.entity_type);
    if (f.from) q = q.gte("occurred_at", f.from);
    if (f.to) q = q.lte("occurred_at", f.to);
    if (f.tenant) q = q.eq("tenant_id", f.tenant);
    const { data } = await q;
    rows = data as unknown as Record<string, unknown>[] | null;
  }

  // Privacy: mask platform-plane actors for org-plane viewers (same rule as the
  // on-screen trail) so exported CSVs never carry a platform person's email.
  const platform =
    user.plane === "org"
      ? await platformEmailSet(supabase, (rows ?? []).map((r) => r.actor_email as string))
      : new Set<string>();

  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cell = (r: Record<string, unknown>, c: string) =>
    c === "actor_email" ? maskActor(r.actor_email as string, platform) : r[c];
  const csv = [cols.join(","), ...(rows ?? []).map((r) => cols.map((c) => esc(cell(r, c))).join(","))].join("\n");

  return new Response(csv, {
    headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="audit.csv"' },
  });
}
