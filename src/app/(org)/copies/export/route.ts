import { createClient } from "@/lib/supabase/server";

// The register export — in an inspection, this file IS the deliverable. One row
// per controlled copy with full accountability: what was issued, to whom, why,
// by whom, and how it was accounted for. RLS scopes rows to the viewer's tenant.
export async function GET() {
  const supabase = await createClient();

  const { data: copies } = await supabase
    .from("controlled_copies")
    .select(
      "id, document_version_id, copy_number, holder, purpose, status, issued_by, issued_at, reconciled_by, reconciled_at, reconciled_method, reconciled_note",
    )
    .order("issued_at", { ascending: true });

  const versionIds = [...new Set((copies ?? []).map((c) => c.document_version_id))];
  const { data: versions } = versionIds.length
    ? await supabase.from("document_versions").select("id, document_id, status, revision_number").in("id", versionIds)
    : { data: [] as { id: string; document_id: string; status: string; revision_number: number | null }[] };
  const docIds = [...new Set((versions ?? []).map((v) => v.document_id))];
  const { data: docs } = docIds.length
    ? await supabase.from("documents").select("id, title, document_number").in("id", docIds)
    : { data: [] as { id: string; title: string; document_number: string | null }[] };
  const userIds = [
    ...new Set((copies ?? []).flatMap((c) => [c.issued_by, c.reconciled_by]).filter(Boolean)),
  ] as string[];
  const { data: users } = userIds.length
    ? await supabase.from("users").select("id, email").in("id", userIds)
    : { data: [] as { id: string; email: string }[] };
  const emailOf = (id: string | null) => users?.find((u) => u.id === id)?.email ?? "";

  const cols = [
    "copy_number", "document_number", "document_title", "revision", "version_status",
    "holder", "purpose", "status", "issued_by", "issued_at",
    "reconciled_method", "reconciled_note", "reconciled_by", "reconciled_at",
  ];
  const rows = (copies ?? []).map((c) => {
    const v = versions?.find((x) => x.id === c.document_version_id);
    const d = docs?.find((x) => x.id === v?.document_id);
    return {
      copy_number: c.copy_number,
      document_number: d?.document_number ?? "",
      document_title: d?.title ?? "",
      revision: v?.revision_number ?? "",
      version_status: v?.status ?? "",
      holder: c.holder,
      purpose: c.purpose ?? "",
      status: c.status,
      issued_by: emailOf(c.issued_by),
      issued_at: c.issued_at ?? "",
      reconciled_method: c.reconciled_method ?? "",
      reconciled_note: c.reconciled_note ?? "",
      reconciled_by: emailOf(c.reconciled_by),
      reconciled_at: c.reconciled_at ?? "",
    } as Record<string, unknown>;
  });

  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv",
      "content-disposition": 'attachment; filename="controlled-copy-register.csv"',
    },
  });
}
