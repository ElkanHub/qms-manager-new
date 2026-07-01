import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { createDepartment, assignHod } from "../actions";

// S-DEPARTMENTS — QA creates departments (QA exists as default) and assigns HODs.
export default async function Departments() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();
  const { data: departments } = await supabase.from("departments").select("*").order("name");
  const { data: users } = await supabase.from("users").select("id, email, full_name").eq("status", "active");

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Departments</h1>

      <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {(departments ?? []).map((d) => (
          <li key={d.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="font-medium">{d.name}</span>
            {d.is_default && <span className="text-xs text-neutral-500">default (QA)</span>}
          </li>
        ))}
      </ul>

      {isQA ? (
        <div className="mt-8 grid gap-8">
          <section>
            <h2 className="mb-2 text-sm font-semibold">Create department</h2>
            <ActionForm action={createDepartment} submitLabel="Create">
              <input name="name" required placeholder="Department name"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            </ActionForm>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">Assign HOD</h2>
            <ActionForm action={assignHod} submitLabel="Assign HOD">
              <select name="user_id" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
                {(users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>
                ))}
              </select>
              <select name="department_id" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
                {(departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </ActionForm>
          </section>
        </div>
      ) : (
        <p className="mt-6 text-sm text-neutral-500">Only QA can create departments or assign HODs.</p>
      )}
    </main>
  );
}
