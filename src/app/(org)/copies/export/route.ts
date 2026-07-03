import { createClient } from "@/lib/supabase/server";

// The register export — in an inspection, this file IS the deliverable. One row
// per copy that has ever left the system, with full accountability: what was
// issued, which revision, what type, to whom, why, by whom, and how it was
// accounted for. RLS scopes rows to the viewer's tenant.
export async function GET() {
  const supabase = await createClient();

  const { data: copies } = await supabase
    .from("copies_register")
    .select(
      "copy_number, document_number, title, revision_number, version_status, copy_type, format, holder, purpose, live_state, issued_by, issued_at, reconciled_method, reconciled_note, reconciled_by, reconciled_at",
    )
    .order("issued_at", { ascending: true });

  const userIds = [
    ...new Set((copies ?? []).flatMap((c) => [c.issued_by, c.reconciled_by]).filter(Boolean)),
  ] as string[];
  const { data: users } = userIds.length
    ? await supabase.from("users").select("id, email").in("id", userIds)
    : { data: [] as { id: string; email: string }[] };
  const emailOf = (id: string | null) => users?.find((u) => u.id === id)?.email ?? "";

  const cols = [
    "copy_number", "document_number", "document_title", "revision", "version_status",
    "copy_type", "format", "holder", "purpose", "state", "issued_by", "issued_at",
    "reconciled_method", "reconciled_note", "reconciled_by", "reconciled_at",
  ];
  const rows = (copies ?? []).map(
    (c) =>
      ({
        copy_number: c.copy_number,
        document_number: c.document_number ?? "",
        document_title: c.title ?? "",
        revision: c.revision_number ?? "",
        version_status: c.version_status ?? "",
        copy_type: c.copy_type,
        format: c.format,
        holder: c.holder,
        purpose: c.purpose ?? "",
        state: c.live_state,
        issued_by: emailOf(c.issued_by),
        issued_at: c.issued_at ?? "",
        reconciled_method: c.reconciled_method ?? "",
        reconciled_note: c.reconciled_note ?? "",
        reconciled_by: emailOf(c.reconciled_by),
        reconciled_at: c.reconciled_at ?? "",
      }) as Record<string, unknown>,
  );

  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv",
      "content-disposition": 'attachment; filename="copy-register.csv"',
    },
  });
}
