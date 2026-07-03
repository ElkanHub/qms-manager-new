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
  const [{ data: fmt }, { data: myDept }] = await Promise.all([
    supabase.from("numbering_formats").select("format, next_seq").maybeSingle(),
    supabase.from("departments").select("name, code").eq("is_default", true).maybeSingle(),
  ]);

  // Normalize either shape to v2 segments (mirrors app.numbering_segments).
  type Segment =
    | { type: "text"; value: string }
    | { type: "department" }
    | { type: "sequence"; pad: number };
  const f = (fmt?.format ?? {}) as {
    segments?: Segment[]; sep?: string; scope?: string; prefix?: string; pad?: number;
  };
  const initialSegments: Segment[] = f.segments ?? [
    { type: "text", value: f.prefix ?? "SOP" },
    { type: "sequence", pad: f.pad ?? 3 },
  ];
  const nextSeq = fmt?.next_seq ?? 1;
  const sampleDeptCode =
    myDept?.code?.toUpperCase() ??
    (myDept?.name ?? "QA").replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();

  return (
    <div className="mx-auto max-w-lg space-y-6 p-2">
      <PageHeader
        title="Numbering"
        description="Your SOP-number convention — a searchable label over each document's system identity. Changing it never affects identity, version chains, or audit references."
      />

      <SectionCard
        title="Format editor"
        description="Arrange the pieces in your order — label, department tag, number — pick the separator and how the counter runs. Department codes come from the Departments page. Module enable/disable is handled by the platform on the switchboard."
      >
        <NumberingEditor
          initialSegments={initialSegments}
          initialSep={f.sep ?? "-"}
          initialScope={(f.scope as "tenant" | "department") ?? "tenant"}
          nextSeq={nextSeq}
          sampleDeptCode={sampleDeptCode}
        />
      </SectionCard>

      <Alert>
        <AlertDescription>
          Existing numbers are never rewritten — a format change applies to new documents only.
          New documents are numbered the moment their starter request is dispatched, carrying the
          originating department's tag.
        </AlertDescription>
      </Alert>
    </div>
  );
}
