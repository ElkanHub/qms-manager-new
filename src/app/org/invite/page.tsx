import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { inviteUser } from "../actions";

const QUALITY_CRITICAL = new Set(["qa", "approver", "signatory"]);

// S-INVITE — invite composer (email + intended department/role). Quality-critical
// roles only appear for QA; the server enforces the same boundary.
export default async function Invite() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();
  const { data: roles } = await supabase.from("roles").select("*").order("label");
  const { data: departments } = await supabase.from("departments").select("id, name").order("name");
  const invitable = (roles ?? []).filter((r) => isQA || !QUALITY_CRITICAL.has(r.key));

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Send invitation</h1>
      <p className="mt-1 text-sm text-neutral-600">
        A one-time, expiring invitation bound to this tenant, department, and role. The
        invitee signs in with Google; their account is created already bound.
      </p>
      <div className="mt-6">
        <ActionForm action={inviteUser} submitLabel="Create invitation">
          <input name="email" type="email" required placeholder="invitee@company.com"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <select name="role" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            {invitable.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <select name="department_id" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            <option value="">— org-wide (no department) —</option>
            {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </ActionForm>
      </div>
      <p className="mt-4 text-xs text-neutral-500">
        The invitation link is shown after creation. Email delivery is wired in a later phase.
      </p>
    </main>
  );
}
