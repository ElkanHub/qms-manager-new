import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { requestRetirement } from "@/app/retire/actions";

// D-RETIRE-REQUEST — raise discontinuation of a whole document, with justification.
export default async function RetireRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOrgUser();
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("title, document_number, status").eq("id", id).maybeSingle();

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Retire document</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {doc?.document_number ?? "—"} · {doc?.title ?? id}
      </p>
      {doc?.status !== "active" ? (
        <p className="mt-4 text-sm text-amber-700">Only an active document can be retired (this is {doc?.status ?? "unknown"}).</p>
      ) : (
        <div className="mt-6">
          <ActionForm action={requestRetirement} submitLabel="Request retirement">
            <input type="hidden" name="document_id" value={id} />
            <textarea name="justification" required rows={3} placeholder="Why is this document being discontinued?"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </ActionForm>
        </div>
      )}
      <p className="mt-4 text-xs text-neutral-500">
        QA reviews pre-checks (no dependent references, training closed) before approval; a
        retention hold applies before any destruction.
      </p>
    </main>
  );
}
