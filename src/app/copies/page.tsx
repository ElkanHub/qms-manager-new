import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { issueCopy, reconcileCopy } from "@/app/oversight/actions";

// D-COPIES — the controlled-copy register (QA). Issue copies against a document's
// effective version and reconcile them; this feeds the change pipe's reconciliation.
export default async function Copies() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();

  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, document_number, current_version_id")
    .eq("status", "active")
    .order("document_number");
  const { data: copies } = await supabase
    .from("controlled_copies")
    .select("id, document_version_id, copy_number, holder, status, reconciled_method")
    .order("issued_at", { ascending: false });

  // map version → document (no declared FK join; mirror the master-index pattern)
  const versionIds = [...new Set((copies ?? []).map((c) => c.document_version_id))];
  const { data: versions } = versionIds.length
    ? await supabase.from("document_versions").select("id, document_id").in("id", versionIds)
    : { data: [] as { id: string; document_id: string }[] };
  const docLabel = (versionId: string) => {
    const dvId = versions?.find((v) => v.id === versionId)?.document_id;
    const d = docs?.find((x) => x.id === dvId);
    return d ? `${d.document_number ?? "—"} · ${d.title}` : versionId;
  };

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Controlled copies</h1>
      {!isQA && <p className="mt-2 text-sm text-neutral-500">Only QA can issue or reconcile copies.</p>}

      {isQA && (
        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold">Issue a copy</h2>
          <ActionForm action={issueCopy} submitLabel="Issue">
            <select name="version_id" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              {(docs ?? []).filter((d) => d.current_version_id).map((d) => (
                <option key={d.id} value={d.current_version_id!}>{d.document_number ?? "—"} · {d.title}</option>
              ))}
            </select>
            <input name="holder" required placeholder="Holder (shop floor, parts desk, contract site…)"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </ActionForm>
        </section>
      )}

      <h2 className="mt-8 mb-2 text-sm font-semibold">Register</h2>
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {(copies ?? []).map((c) => (
          <li key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>
              <span className="font-medium">{docLabel(c.document_version_id)}</span>{" "}
              <span className="text-neutral-500">copy #{c.copy_number} — {c.holder}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className={`text-xs uppercase ${c.status === "issued" ? "text-amber-600" : "text-green-700"}`}>
                {c.status}{c.reconciled_method ? ` (${c.reconciled_method})` : ""}
              </span>
              {isQA && c.status === "issued" && (
                <ActionForm action={reconcileCopy} submitLabel="Reconcile">
                  <input type="hidden" name="copy_id" value={c.id} />
                  <input name="method" placeholder="returned / destroyed"
                    className="rounded-md border border-neutral-300 px-2 py-1 text-xs" />
                </ActionForm>
              )}
            </span>
          </li>
        ))}
        {!copies?.length && <li className="px-4 py-3 text-sm text-neutral-500">No controlled copies issued.</li>}
      </ul>
    </main>
  );
}
