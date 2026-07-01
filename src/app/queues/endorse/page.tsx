import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { endorse, requestChanges } from "@/app/documents/actions";

// D-ENDORSE — HOD endorsement queue. Employee submissions awaiting this HOD.
// Endorse is disabled for the viewer's own submissions (an author never endorses
// their own document); the server enforces SoD regardless.
export default async function EndorseQueue() {
  const me = await requireOrgUser();
  const isHOD = (await getMyRoles()).includes("hod");
  const supabase = await createClient();

  const { data: requests } = await supabase
    .from("approval_requests")
    .select("id, document_id, submitted_by")
    .eq("stage", "hod_review")
    .eq("status", "pending")
    .order("created_at");
  const ids = [...new Set((requests ?? []).map((r) => r.document_id))];
  const { data: docs } = ids.length
    ? await supabase.from("documents").select("id, document_number, title").in("id", ids)
    : { data: [] };
  const docOf = (id: string) => docs?.find((d) => d.id === id);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Endorsement queue</h1>
      {!isHOD && <p className="mt-2 text-sm text-neutral-500">Only department heads endorse submissions.</p>}

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
              {mine && <p className="mt-1 text-xs text-amber-700">You submitted this — endorsement routes to a peer HOD or QA.</p>}
              <div className="mt-3 flex flex-wrap gap-6">
                {mine ? (
                  <button disabled className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white opacity-40">
                    Endorse
                  </button>
                ) : (
                  <ActionForm action={endorse} submitLabel="Endorse">
                    <input type="hidden" name="request_id" value={r.id} />
                  </ActionForm>
                )}
                <ActionForm action={requestChanges} submitLabel="Request changes">
                  <input type="hidden" name="request_id" value={r.id} />
                  <input name="reason" required placeholder="Reason"
                    className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                </ActionForm>
              </div>
            </li>
          );
        })}
        {!requests?.length && <li className="text-sm text-neutral-500">Nothing awaiting endorsement.</li>}
      </ul>
    </main>
  );
}
