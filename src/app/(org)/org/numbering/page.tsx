import { redirect } from "next/navigation";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NumberingEditor } from "./numbering-editor";

// D-NUMBERING-CONFIG — QA defines the company's numbering convention. The number is
// metadata over the immutable system id (A.3); this only shapes the human label.
export default async function NumberingConfig() {
  await requireOrgUser();
  if (!(await getMyRoles()).includes("qa")) redirect("/org");

  const supabase = await createClient();
  const { data: fmt } = await supabase.from("numbering_formats").select("format, next_seq").maybeSingle();
  const initial = {
    prefix: fmt?.format?.prefix ?? "SOP",
    sep: fmt?.format?.sep ?? "-",
    pad: fmt?.format?.pad ?? 3,
  };
  const nextSeq = fmt?.next_seq ?? 1;

  return (
    <div className="mx-auto max-w-lg space-y-6 p-2">
      <PageHeader
        title="Numbering"
        description="Your SOP-number convention — a searchable label over each document's system identity. Changing it never affects identity, version chains, or audit references."
      />

      <SectionCard
        title="Format editor"
        description="Prefix, separator, and digit width. Module enable/disable is handled by the platform on the switchboard."
      >
        <NumberingEditor initial={initial} nextSeq={nextSeq} />
      </SectionCard>

      <Alert>
        <AlertDescription>Existing numbers are never rewritten.</AlertDescription>
      </Alert>
    </div>
  );
}
