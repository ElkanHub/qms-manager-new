import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { concludeReview } from "@/app/oversight/actions";

// D-PERIODIC — periodic review queue. The core always stores next-review dates; this
// module surfaces due/overdue items. Concluding "revise" raises a change request.
export default async function Periodic() {
  const user = await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();

  const { data: mod } = await supabase
    .from("tenant_modules").select("enabled").eq("module_key", "periodic_review").maybeSingle();
  const surfacing = mod?.enabled ?? false;

  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, document_number, next_review_at, owner_id")
    .eq("status", "active")
    .order("next_review_at", { ascending: true });
  const now = Date.now();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Periodic review</h1>
      {!surfacing && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Proactive surfacing is off — manual review is still available below.
        </p>
      )}
      <ul className="mt-4 space-y-3">
        {(docs ?? []).map((d) => {
          const due = d.next_review_at && new Date(d.next_review_at).getTime() <= now;
          const canConclude = isQA || d.owner_id === user.id;
          return (
            <li key={d.id} className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{d.document_number ?? "—"} · {d.title}</span>
                <span className={`text-xs ${due ? "text-red-600" : "text-neutral-500"}`}>
                  {due ? "overdue" : "due"} {d.next_review_at ? new Date(d.next_review_at).toISOString().slice(0, 10) : "—"}
                </span>
              </div>
              {due && canConclude && (
                <div className="mt-2">
                  <ActionForm action={concludeReview} submitLabel="Conclude review">
                    <input type="hidden" name="document_id" value={d.id} />
                    <select name="outcome" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
                      <option value="no_change">No change — reschedule</option>
                      <option value="revise">Revise — raise a change</option>
                    </select>
                    <input name="reason" placeholder="Reason / notes"
                      className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                  </ActionForm>
                </div>
              )}
            </li>
          );
        })}
        {!docs?.length && <li className="text-sm text-neutral-500">No effective documents to review.</li>}
      </ul>
    </main>
  );
}
