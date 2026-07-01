import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { approveRetirement, withdrawRetirement } from "@/app/retire/actions";

// D-RETIRE-REVIEW — QA reviews retirement requests. Approval enforces the pre-checks
// (surfaced as an error if they fail) and QA ≠ requester; then QA withdraws from use,
// starting the retention hold.
export default async function Retirements() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("retirements")
    .select("id, document_id, status, justification, precheck_results")
    .in("status", ["retirement_requested", "retirement_approved"])
    .order("created_at", { ascending: false });
  const { data: docs } = await supabase.from("documents").select("id, title, document_number");
  const label = (id: string) => {
    const d = docs?.find((x) => x.id === id);
    return d ? `${d.document_number ?? "—"} · ${d.title}` : id;
  };

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Retirement requests</h1>
      {!isQA && <p className="mt-2 text-sm text-neutral-500">Only QA can approve retirements.</p>}
      <ul className="mt-4 space-y-4">
        {(rows ?? []).map((r) => (
          <li key={r.id} className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
            <p className="font-medium">{label(r.document_id)}</p>
            <p className="text-neutral-600">{r.justification}</p>
            <p className="mt-1 text-xs uppercase text-neutral-500">{r.status}</p>
            {r.precheck_results && (
              <pre className="mt-2 overflow-x-auto rounded bg-neutral-100 p-2 text-xs">{JSON.stringify(r.precheck_results)}</pre>
            )}
            {isQA && r.status === "retirement_requested" && (
              <div className="mt-2">
                <ActionForm action={approveRetirement} submitLabel="Approve (runs pre-checks)">
                  <input type="hidden" name="retirement_id" value={r.id} />
                </ActionForm>
              </div>
            )}
            {isQA && r.status === "retirement_approved" && (
              <div className="mt-2">
                <ActionForm action={withdrawRetirement} submitLabel="Withdraw from use (start retention)">
                  <input type="hidden" name="retirement_id" value={r.id} />
                </ActionForm>
              </div>
            )}
          </li>
        ))}
        {!rows?.length && <li className="text-sm text-neutral-500">No open retirement requests.</li>}
      </ul>
    </main>
  );
}
