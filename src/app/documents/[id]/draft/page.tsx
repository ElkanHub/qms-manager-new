import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { updateDraft, submitDocument } from "../../actions";

// D-DRAFT — the author's draft editor. Edit title/content/reason, then submit into
// the pipe (employee → HOD endorsement; manager → straight to QA). Enforcement is
// server-side; this screen just reflects state.
export default async function DraftEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOrgUser();
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, document_number, title, status")
    .eq("id", id)
    .maybeSingle();
  const { data: version } = await supabase
    .from("document_versions")
    .select("content_ref, reason_for_change")
    .eq("document_id", id)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!doc) {
    return <main className="mx-auto max-w-lg p-8"><p className="text-sm text-neutral-600">Document not found.</p></main>;
  }

  const editable = doc.status === "draft" || doc.status === "in_review";

  return (
    <main className="mx-auto max-w-lg p-8">
      <p className="text-sm text-neutral-500">{doc.document_number ?? "—"}</p>
      <h1 className="text-2xl font-semibold">{doc.title}</h1>
      <p className="mt-1 text-sm text-neutral-600">Status: {doc.status}</p>

      {!editable ? (
        <p className="mt-6 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600">
          This document is no longer editable in draft (it is {doc.status}).
        </p>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Edit draft</h2>
            <ActionForm action={updateDraft} submitLabel="Save draft">
              <input type="hidden" name="document_id" value={doc.id} />
              <input name="title" defaultValue={doc.title ?? ""} placeholder="Title"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
              <input name="content_ref" defaultValue={version?.content_ref ?? ""} placeholder="Content reference / upload URL"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
              <textarea name="reason" defaultValue={version?.reason_for_change ?? ""} rows={2}
                placeholder="Reason for change (required to submit)"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            </ActionForm>
          </section>

          <section className="mt-8">
            <h2 className="mb-1 text-sm font-semibold">Submit for review</h2>
            <p className="mb-2 text-xs text-neutral-500">
              Employees go to HOD endorsement first; managers go straight to QA.
            </p>
            <ActionForm action={submitDocument} submitLabel="Submit for review">
              <input type="hidden" name="document_id" value={doc.id} />
            </ActionForm>
          </section>
        </>
      )}
    </main>
  );
}
