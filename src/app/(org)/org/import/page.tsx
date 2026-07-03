import { redirect } from "next/navigation";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { ImportClient } from "./import-client";

// D-LEGACY-IMPORT — bring the client's existing library in whole. CSV in,
// dry-run report out, then an all-or-nothing commit. Historical numbers are
// preserved exactly (duplicates included, on distinct system ids); every row
// is audited as document.imported_legacy plus one batch event.
export default async function LegacyImport() {
  await requireOrgUser();
  const roles = await getMyRoles();
  if (!roles.includes("qa") && !roles.includes("org_admin")) redirect("/org");

  const supabase = await createClient();
  const { data: departments } = await supabase
    .from("departments")
    .select("name, code")
    .order("name");
  const { count: legacyCount } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("is_legacy", true);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        title="Legacy library import"
        description={`Migrate the existing document register in one pass. Dry-run first — nothing is written until every row is valid.${
          legacyCount ? ` ${legacyCount} legacy documents already imported.` : ""
        }`}
      />
      <ImportClient
        departments={(departments ?? []).map((d) => ({ name: d.name, code: d.code ?? null }))}
      />
    </div>
  );
}
