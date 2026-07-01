import { redirect } from "next/navigation";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { setMatrix } from "../../changes/actions";

const CLASSES = ["minor", "major", "critical"] as const;
const DEFAULTS: Record<string, string> = { minor: "qa", major: "qa,hod", critical: "qa,hod,signatory" };

// D-CLASSIFY — QA edits the data-driven classification matrix (class → required
// signatory roles). The matrix is itself controlled data; existence of classification
// and the impact hard gate are not configurable.
export default async function Classify() {
  await requireOrgUser();
  if (!(await getMyRoles()).includes("qa")) redirect("/org");
  const supabase = await createClient();
  const { data: matrix } = await supabase.from("classification_matrix").select("class, required_roles");
  const rolesOf = (cls: string) => {
    const row = matrix?.find((m) => m.class === cls);
    return row ? (row.required_roles as string[]).join(",") : DEFAULTS[cls];
  };

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Classification matrix</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Required signatory roles per risk class. Shown values are the current matrix (or the
        safe defaults until you set them). Roles: qa, hod, signatory, approver, trainer.
      </p>
      <div className="mt-6 space-y-6">
        {CLASSES.map((cls) => (
          <div key={cls} className="rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold capitalize">{cls}</h2>
            <ActionForm action={setMatrix} submitLabel="Save">
              <input type="hidden" name="class" value={cls} />
              <input name="roles" defaultValue={rolesOf(cls)}
                className="rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm" />
            </ActionForm>
          </div>
        ))}
      </div>
    </main>
  );
}
