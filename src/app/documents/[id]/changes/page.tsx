import Link from "next/link";
import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { updateDraft, resubmitDocument } from "../../actions";

// D-CHANGES — the author's response to a changes-requested review. Shows the
// reviewer's reason, lets the author revise, then resubmit. Prior versions preserved.
export default async function ChangesResponse({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOrgUser();
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, document_number, title, status")
    .eq("id", id)
    .maybeSingle();
  const { data: request } = await supabase
    .from("approval_requests")
    .select("id, stage, reason")
    .eq("document_id", id)
    .eq("status", "changes_requested")
    .order("created_at", { ascending: false })
    .limit(1)
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

  return (
    <main className="mx-auto max-w-lg p-8">
      <p className="text-sm text-neutral-500">{doc.document_number ?? "—"}</p>
      <h1 className="text-2xl font-semibold">{doc.title}</h1>

      {!request ? (
        <p className="mt-6 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600">
          No changes have been requested. <Link href={`/documents/${id}/draft`} className="underline">Back to draft</Link>
        </p>
      ) : (
        <>
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium text-amber-800">Changes requested ({request.stage})</p>
            <p className="text-amber-700">{request.reason}</p>
          </div>

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Revise</h2>
            <ActionForm action={updateDraft} submitLabel="Save changes">
              <input type="hidden" name="document_id" value={doc.id} />
              <input name="title" defaultValue={doc.title ?? ""} placeholder="Title"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
              <input name="content_ref" defaultValue={version?.content_ref ?? ""} placeholder="Content reference / upload URL"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
              <textarea name="reason" defaultValue={version?.reason_for_change ?? ""} rows={2}
                placeholder="Reason for change"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            </ActionForm>
          </section>

          <section className="mt-8">
            <h2 className="mb-2 text-sm font-semibold">Resubmit</h2>
            <ActionForm action={resubmitDocument} submitLabel="Resubmit">
              <input type="hidden" name="document_id" value={doc.id} />
            </ActionForm>
          </section>
        </>
      )}
    </main>
  );
}
