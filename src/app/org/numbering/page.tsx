import { redirect } from "next/navigation";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { setNumberingFormat } from "../actions";

// D-NUMBERING-CONFIG — QA defines the company's numbering convention. The number is
// metadata over the immutable system id (A.3); this only shapes the human label.
export default async function NumberingConfig() {
  await requireOrgUser();
  if (!(await getMyRoles()).includes("qa")) redirect("/org");

  const supabase = await createClient();
  const { data: fmt } = await supabase.from("numbering_formats").select("format, next_seq").maybeSingle();
  const current = JSON.stringify(fmt?.format ?? { prefix: "SOP", sep: "-", pad: 3 }, null, 2);
  const preview = `${fmt?.format?.prefix ?? "SOP"}${fmt?.format?.sep ?? "-"}${String(fmt?.next_seq ?? 1).padStart(fmt?.format?.pad ?? 3, "0")}`;

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Numbering format</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Your SOP-number convention. It is a searchable label over each document&apos;s system
        identity — changing it never affects identity, version chains, or audit references.
      </p>
      <p className="mt-3 text-sm">
        Next number preview: <code className="rounded bg-neutral-900 px-2 py-1 text-neutral-100">{preview}</code>
      </p>
      <div className="mt-6">
        <ActionForm action={setNumberingFormat} submitLabel="Save format">
          <textarea name="format" defaultValue={current} rows={6}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs" />
        </ActionForm>
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Fields: <code>prefix</code>, <code>sep</code> (separator), <code>pad</code> (digit width).
        Enabling/disabling the Numbering module itself is done by the platform on the switchboard.
      </p>
    </main>
  );
}
