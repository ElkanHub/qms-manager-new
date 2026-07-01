import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { grantRole, deactivateUser } from "../actions";

const QUALITY_CRITICAL = new Set(["qa", "approver", "signatory"]);

// S-USERS — user & role management. The delegation boundary is reflected here
// (Org-Admins don't see quality-critical role options); the server enforces it.
export default async function Users() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();
  const { data: users } = await supabase.from("users").select("*").order("email");
  const { data: roles } = await supabase.from("roles").select("*").order("label");
  const { data: assignments } = await supabase.from("user_roles").select("user_id, role");

  const grantable = (roles ?? []).filter((r) => isQA || !QUALITY_CRITICAL.has(r.key));

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Users &amp; roles</h1>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-2">User</th><th>Roles</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(users ?? []).map((u) => (
            <tr key={u.id} className="border-b border-neutral-100">
              <td className="py-2">{u.full_name ?? u.email}</td>
              <td>{(assignments ?? []).filter((a) => a.user_id === u.id).map((a) => a.role).join(", ") || "—"}</td>
              <td>{u.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-8 grid gap-8">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Grant role</h2>
          {!isQA && (
            <p className="mb-2 text-xs text-neutral-500">
              You can grant non–quality-critical roles. QA, Approver, and Signatory are QA-only.
            </p>
          )}
          <ActionForm action={grantRole} submitLabel="Grant">
            <select name="user_id" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
            </select>
            <select name="role" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              {grantable.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <input name="department_id" placeholder="Department id (for department-scoped roles)"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </ActionForm>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Deactivate user</h2>
          <ActionForm action={deactivateUser} submitLabel="Deactivate">
            <select name="user_id" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              {(users ?? []).filter((u) => u.status === "active").map((u) =>
                <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
            </select>
            <input name="reason" required placeholder="Reason (required, audited)"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </ActionForm>
        </section>
      </div>
    </main>
  );
}
