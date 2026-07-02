import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { StateTimeline, type TimelineStage } from "@/components/app/state-timeline";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateDraft, submitDocument } from "../../actions";

// D-DRAFT — the author's draft editor. Edit title/content/reason, then submit into
// the pipe (employee → HOD endorsement; manager → straight to QA). Enforcement is
// server-side; this screen just reflects state.
export default async function DraftEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOrgUser();
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, document_number, title, status")
    .eq("id", id)
    .maybeSingle();
  const { data: version } = await supabase
    .from("document_versions")
    .select("content_ref, reason_for_change")
    .eq("document_id", id)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!doc) {
    return (
      <div className="mx-auto max-w-lg space-y-6 p-2">
        <p className="text-sm text-muted-foreground">Document not found.</p>
      </div>
    );
  }

  const editable = doc.status === "draft" || doc.status === "in_review";

  // Display-only routing reflection (server RPC still decides): managers (HOD/QA/admin)
  // submit straight to QA; everyone else goes to HOD endorsement first.
  const roles = await getMyRoles();
  const skipsHod = roles.includes("hod") || roles.includes("qa") || roles.includes("org_admin");
  const stages: TimelineStage[] = skipsHod
    ? [
        { label: "Draft", state: "current" },
        { label: "QA review", state: "upcoming" },
        { label: "Approved", state: "upcoming" },
      ]
    : [
        { label: "Draft", state: "current" },
        { label: "HOD endorsement", state: "upcoming" },
        { label: "QA review", state: "upcoming" },
        { label: "Approved", state: "upcoming" },
      ];

  return (
    <div className="mx-auto max-w-lg space-y-6 p-2">
      <PageHeader
        title={doc.title ?? "Untitled"}
        overline={doc.document_number ?? "—"}
        status={doc.status}
      />

      {!editable ? (
        <Alert>
          <AlertDescription>
            This document is no longer editable in draft (it is {doc.status}).
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <SectionCard title="Edit draft">
            <ActionForm action={updateDraft} submitLabel="Save draft">
              <input type="hidden" name="document_id" value={doc.id} />
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" defaultValue={doc.title ?? ""} placeholder="Title" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="content_ref">Content reference</Label>
                <Input
                  id="content_ref"
                  name="content_ref"
                  defaultValue={version?.content_ref ?? ""}
                  placeholder="Content reference / upload URL"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reason">Reason for change</Label>
                <Textarea
                  id="reason"
                  name="reason"
                  rows={2}
                  defaultValue={version?.reason_for_change ?? ""}
                  placeholder="Reason for change (required to submit)"
                />
              </div>
            </ActionForm>
          </SectionCard>

          <SectionCard
            title="Submit for review"
            description="Employees go to HOD endorsement first; managers go straight to QA."
          >
            <StateTimeline stages={stages} className="mb-4" />
            <ActionForm action={submitDocument} submitLabel="Submit for review">
              <input type="hidden" name="document_id" value={doc.id} />
            </ActionForm>
          </SectionCard>
        </>
      )}
    </div>
  );
}
