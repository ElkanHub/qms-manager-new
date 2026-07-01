import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// D-HISTORY — read-only version history. Answers "which version was effective when."
// Superseded/retained versions are viewable here for reference. RLS still applies:
// effective versions are tenant-wide; in-flight rows show only to those party to them.
export default async function DocumentHistory({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();
  const { data: document } = await supabase.from("documents").select("title, document_number").eq("id", id).maybeSingle();
  const { data: versions } = await supabase
    .from("document_versions")
    .select("id, revision_number, status, effective_from, superseded_at, created_at")
    .eq("document_id", id)
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/documents/${id}`} className="text-sm underline">← Back to document</Link>
      <h1 className="mt-2 text-2xl font-semibold">{document?.title ?? "Version history"}</h1>
      <p className="text-sm text-neutral-500">{document?.document_number ?? ""}</p>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-2">Revision</th><th>Status</th><th>Effective</th><th>Superseded</th>
          </tr>
        </thead>
        <tbody>
          {(versions ?? []).map((v) => (
            <tr key={v.id} className="border-b border-neutral-100">
              <td className="py-2">{v.revision_number != null ? String(v.revision_number).padStart(2, "0") : "—"}</td>
              <td>{v.status}</td>
              <td>{v.effective_from ? new Date(v.effective_from).toISOString().slice(0, 10) : "—"}</td>
              <td>{v.superseded_at ? new Date(v.superseded_at).toISOString().slice(0, 10) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!versions?.length && <p className="mt-4 text-sm text-neutral-500">No visible versions.</p>}
    </main>
  );
}
