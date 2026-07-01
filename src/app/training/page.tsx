import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { assignTraining, completeTraining } from "@/app/oversight/actions";

// D-TRAINING — assign training on effective documents, record completion, and show
// per-document threshold status. Stragglers (still 'assigned') are flagged; the core
// blocks release until the threshold is met (enforced server-side).
export default async function Training() {
  await requireOrgUser();
  const roles = await getMyRoles();
  const isAllowed = roles.includes("qa") || roles.includes("trainer");
  const supabase = await createClient();

  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, document_number")
    .eq("status", "active")
    .order("document_number");
  const { data: users } = await supabase.from("users").select("id, email, full_name").order("email");
  const { data: assignments } = await supabase
    .from("training_assignments")
    .select("id, document_id, user_id, status, completed_at")
    .order("assigned_at", { ascending: false });

  const docLabel = (id: string) => {
    const d = docs?.find((x) => x.id === id);
    return d ? `${d.document_number ?? "—"} · ${d.title}` : id;
  };
  const userLabel = (id: string) => {
    const u = users?.find((x) => x.id === id);
    return u ? (u.full_name ?? u.email) : id;
  };
  // per-document completed/total
  const stats = new Map<string, { done: number; total: number }>();
  for (const a of assignments ?? []) {
    const s = stats.get(a.document_id) ?? { done: 0, total: 0 };
    s.total += 1;
    if (a.status === "completed") s.done += 1;
    stats.set(a.document_id, s);
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Training</h1>
      {!isAllowed && <p className="mt-2 text-sm text-neutral-500">Only QA/trainers can assign or record training.</p>}

      {isAllowed && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold">Assign training</h2>
          <ActionForm action={assignTraining} submitLabel="Assign">
            <select name="document_id" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              {(docs ?? []).map((d) => <option key={d.id} value={d.id}>{docLabel(d.id)}</option>)}
            </select>
            <select name="user_id" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              {(users ?? []).map((u) => <option key={u.id} value={u.id}>{userLabel(u.id)}</option>)}
            </select>
          </ActionForm>
        </section>
      )}

      <h2 className="mt-8 mb-2 text-sm font-semibold">Assignments</h2>
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {(assignments ?? []).map((a) => {
          const s = stats.get(a.document_id);
          return (
            <li key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>
                <span className="font-medium">{docLabel(a.document_id)}</span>{" "}
                <span className="text-neutral-500">— {userLabel(a.user_id)}</span>
                {s && <span className="ml-2 text-xs text-neutral-400">({s.done}/{s.total} trained)</span>}
              </span>
              <span className="flex items-center gap-3">
                <span className={`text-xs uppercase ${a.status === "assigned" ? "text-amber-600" : "text-green-700"}`}>
                  {a.status === "assigned" ? "straggler" : "completed"}
                </span>
                {isAllowed && a.status === "assigned" && (
                  <form action={async (fd) => { "use server"; await completeTraining(fd); }}>
                    <input type="hidden" name="assignment_id" value={a.id} />
                    <button className="text-xs underline">mark complete</button>
                  </form>
                )}
              </span>
            </li>
          );
        })}
        {!assignments?.length && <li className="px-4 py-3 text-sm text-neutral-500">No training assigned.</li>}
      </ul>
    </main>
  );
}
