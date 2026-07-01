import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Viewer } from "./Viewer";

// D-READ — the core document read view. Opens the CURRENT EFFECTIVE version,
// read-only, in the configured viewer. Reachable even if the Library module is off
// (this is the core read surface, never off). Serves only effective versions.
export default async function DocumentRead({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("read_document", { p_document: id });
  const doc = data?.[0];

  if (error || !doc) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="mt-2 text-sm text-neutral-600">
          {error?.message ?? "This document has no effective version to read."}
        </p>
      </main>
    );
  }

  const rev = String(doc.revision_number ?? 0).padStart(2, "0");
  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-neutral-500">{doc.document_number ?? "—"}</p>
          <h1 className="text-2xl font-semibold">{doc.title}</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Revision {rev} · effective{" "}
            {doc.effective_from ? new Date(doc.effective_from).toISOString().slice(0, 10) : "—"}
          </p>
        </div>
        <div className="flex gap-4">
          <Link href={`/documents/${id}/history`} className="text-sm underline">
            Version history
          </Link>
          <a href={`/audit/export?document=${id}`} className="text-sm underline">
            Audit story (CSV)
          </a>
        </div>
      </div>
      <div className="mt-6">
        <Viewer renderer={doc.renderer} renditionRef={doc.rendition_ref} />
      </div>
    </main>
  );
}
