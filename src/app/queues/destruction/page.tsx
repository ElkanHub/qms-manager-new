import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { destroyVersion } from "@/app/retire/actions";

// D-DESTRUCTION — the time-gated destruction queue. Lists retained versions whose
// retention has elapsed (from supersession OR retirement). Destruction removes content
// but retains metadata + audit. The time-gate is enforced server-side regardless of role.
export default async function Destruction() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();
  // Retained versions (RLS shows these to QA/party); the server still enforces the gate.
  const { data: versions } = await supabase
    .from("document_versions")
    .select("id, document_id, revision_number, retention_until, status")
    .eq("status", "retained")
    .order("retention_until", { ascending: true });
  const { data: docs } = await supabase.from("documents").select("id, title, document_number");
  const label = (id: string) => {
    const d = docs?.find((x) => x.id === id);
    return d ? `${d.document_number ?? "—"} · ${d.title}` : id;
  };
  const now = Date.now();

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Destruction queue</h1>
      <p className="mt-1 text-sm text-neutral-600">Retained versions and their retention expiry. Destruction is only permitted once retention has elapsed.</p>
      {!isQA && <p className="mt-2 text-sm text-neutral-500">Only QA/Admin can execute destruction.</p>}
      <ul className="mt-4 space-y-3">
        {(versions ?? []).map((v) => {
          const due = v.retention_until && new Date(v.retention_until).getTime() <= now;
          return (
            <li key={v.id} className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{label(v.document_id)} · rev {String(v.revision_number ?? 0).padStart(2, "0")}</span>
                <span className={`text-xs ${due ? "text-red-600" : "text-neutral-500"}`}>
                  retention {due ? "elapsed" : "until"} {v.retention_until ? new Date(v.retention_until).toISOString().slice(0, 10) : "—"}
                </span>
              </div>
              {isQA && due && (
                <div className="mt-2">
                  <ActionForm action={destroyVersion} submitLabel="Destroy (logged)">
                    <input type="hidden" name="version_id" value={v.id} />
                    <input name="method" placeholder="Method (e.g. secure-shred)"
                      className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                    <input name="reason" required placeholder="Reason (required, audited)"
                      className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                  </ActionForm>
                </div>
              )}
            </li>
          );
        })}
        {!versions?.length && <li className="text-sm text-neutral-500">Nothing in retention.</li>}
      </ul>
    </main>
  );
}
