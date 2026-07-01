import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { qaApprove, requestChanges, rejectRequest } from "@/app/documents/actions";

// D-QA-REVIEW — QA review/approval queue. Approve (with training + effective date),
// request changes, or reject (reason required). Approve is disabled for the viewer's
// own submissions (SoD: QA != author/submitter); the server enforces it regardless.
export default async function QaReviewQueue() {
  const me = await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("approval_requests")
    .select("id, document_id, submitted_by")
    .eq("stage", "qa_review")
    .eq("status", "pending")
    .order("created_at");
  const ids = [...new Set((requests ?? []).map((r) => r.document_id))];
  const { data: docs } = ids.length
    ? await supabase.from("documents").select("id, document_number, title").in("id", ids)
    : { data: [] };
  const docOf = (id: string) => docs?.find((d) => d.id === id);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">QA review</h1>
      {!isQA && <p className="mt-2 text-sm text-neutral-500">Only QA approves documents.</p>}

      <ul className="mt-6 space-y-4">
        {(requests ?? []).map((r) => {
          const d = docOf(r.document_id);
          const mine = r.submitted_by === me.id;
          return (
            <li key={r.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <p className="text-sm">
                <span className="text-neutral-500">{d?.document_number ?? "—"}</span>{" "}
                <span className="font-medium">{d?.title ?? r.document_id}</span>
              </p>

              <div className="mt-3 grid gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-xs font-semibold text-neutral-500">Approve</h3>
                  {mine ? (
                    <p className="text-xs text-amber-700">You submitted this — you cannot approve it (SoD).</p>
                  ) : (
                    <ActionForm action={qaApprove} submitLabel="Approve">
                      <input type="hidden" name="request_id" value={r.id} />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="training_required" /> Training required
                      </label>
                      <label className="text-xs text-neutral-500">Effective date (blank = today)</label>
                      <input type="date" name="effective_date"
                        className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                    </ActionForm>
                  )}
                </div>

                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="mb-1 text-xs font-semibold text-neutral-500">Request changes</h3>
                    <ActionForm action={requestChanges} submitLabel="Request changes">
                      <input type="hidden" name="request_id" value={r.id} />
                      <input name="reason" required placeholder="Reason"
                        className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                    </ActionForm>
                  </div>
                  <div>
                    <h3 className="mb-1 text-xs font-semibold text-neutral-500">Reject</h3>
                    <ActionForm action={rejectRequest} submitLabel="Reject">
                      <input type="hidden" name="request_id" value={r.id} />
                      <input name="reason" required placeholder="Reason (required)"
                        className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                    </ActionForm>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {!requests?.length && <li className="text-sm text-neutral-500">Nothing awaiting QA review.</li>}
      </ul>
    </main>
  );
}
