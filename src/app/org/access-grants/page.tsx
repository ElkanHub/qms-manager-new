import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { decideAccess } from "../actions";

// S-ACCESS-GRANT — the org's control point over break-glass. In consent mode, QA
// approves/denies a platform admin's access request, with a required reason.
export default async function AccessGrants() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();
  // RLS scopes these to the caller's tenant automatically.
  const { data: requests } = await supabase
    .from("access_requests")
    .select("id, purpose, mode, status, requested_at")
    .order("requested_at", { ascending: false });

  const pending = (requests ?? []).filter((r) => r.status === "pending");

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Platform access requests</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Every platform-admin access to your data appears in your audit trail. In consent
        mode, access does not open until QA approves.
      </p>

      {!isQA && <p className="mt-6 text-sm text-neutral-500">Only QA can approve or deny access.</p>}

      {isQA && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Pending ({pending.length})</h2>
          <ul className="space-y-4">
            {pending.map((r) => (
              <li key={r.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <p className="text-sm"><span className="font-medium">Purpose:</span> {r.purpose}</p>
                <ActionForm action={decideAccess} submitLabel="Submit decision">
                  <input type="hidden" name="request_id" value={r.id} />
                  <select name="decision" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
                    <option value="approve">Approve</option>
                    <option value="deny">Deny</option>
                  </select>
                  <input name="reason" required placeholder="Reason (required, audited)"
                    className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                </ActionForm>
              </li>
            ))}
            {!pending.length && <li className="text-sm text-neutral-500">No pending requests.</li>}
          </ul>
        </section>
      )}
    </main>
  );
}
