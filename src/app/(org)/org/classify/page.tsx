import { redirect } from "next/navigation";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { MatrixGrid } from "./matrix-grid";

const CLASSES = ["minor", "major", "critical"] as const;
const ROLES = ["qa", "hod", "signatory", "approver", "trainer"] as const;
const DEFAULTS: Record<string, string[]> = {
  minor: ["qa"],
  major: ["qa", "hod"],
  critical: ["qa", "hod", "signatory"],
};

// D-CLASSIFY — QA edits the data-driven classification matrix (class → required
// signatory roles). The matrix is itself controlled data; existence of classification
// and the impact hard gate are not configurable.
export default async function Classify() {
  await requireOrgUser();
  if (!(await getMyRoles()).includes("qa")) redirect("/org");
  const supabase = await createClient();
  const { data: matrix } = await supabase
    .from("classification_matrix")
    .select("class, required_roles");

  const rows = CLASSES.map((cls) => {
    const row = matrix?.find((m) => m.class === cls);
    return {
      class: cls,
      roles: row ? (row.required_roles as string[]) : DEFAULTS[cls],
      isDefault: !row,
    };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        title="Classification matrix"
        description="Required signatory roles per risk class. Rows marked “default” use the safe defaults until you save them. Save a row to persist its signatures."
      />
      <SectionCard>
        <MatrixGrid roles={[...ROLES]} rows={rows} />
      </SectionCard>
    </div>
  );
}
