import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { requestRetirement } from "@/app/(org)/retire/actions";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { StateTimeline } from "@/components/app/state-timeline";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// D-RETIRE-REQUEST — raise discontinuation of a whole document, with justification.
export default async function RetireRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOrgUser();
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("title, document_number, status").eq("id", id).maybeSingle();

  return (
    <div className="mx-auto max-w-lg space-y-6 p-2">
      <PageHeader overline={doc?.document_number ?? "—"} title="Retirement request" description={doc?.title ?? id} />

      {doc?.status !== "active" ? (
        <SectionCard>
          <p className="text-sm text-muted-foreground">
            Only an active document can be retired (this is {doc?.status ?? "unknown"}).
          </p>
        </SectionCard>
      ) : (
        <SectionCard title="Justification" description="QA reviews pre-checks (no dependent references, training closed) before approval; a retention hold applies before any destruction.">
          <ActionForm action={requestRetirement} submitLabel="Request retirement">
            <input type="hidden" name="document_id" value={id} />
            <div className="space-y-2">
              <Label htmlFor="justification">Why is this document being discontinued?</Label>
              <Textarea id="justification" name="justification" required rows={3} />
            </div>
          </ActionForm>
        </SectionCard>
      )}

      <SectionCard title="What happens next">
        <StateTimeline
          stages={[
            { label: "Request", state: "current" },
            { label: "QA pre-checks" },
            { label: "Approved" },
            { label: "Retention hold" },
          ]}
        />
      </SectionCard>
    </div>
  );
}
