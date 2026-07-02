import { requireOrgUser } from "@/lib/auth";
import { ActionForm } from "@/app/_components/ActionForm";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { flagFeedback } from "./actions";

// S-FEEDBACK — the one in-app "flag this" path. Feedback writes through the
// audit primitive (feedback.flagged on the tenant chain), so it is append-only,
// attributable, and visible to QA in the audit viewer alongside everything else.
export default async function Feedback({
  searchParams,
}: {
  searchParams: Promise<{ context?: string }>;
}) {
  await requireOrgUser();
  const { context } = await searchParams;

  return (
    <div className="mx-auto max-w-lg p-2">
      <Card>
        <CardHeader>
          <PageHeader
            title="Flag this"
            description="Send feedback or flag an issue. It lands on the audit trail, attributed to you."
          />
        </CardHeader>
        <CardContent>
          <ActionForm action={flagFeedback} submitLabel="Flag it">
            <div className="space-y-2">
              <Label htmlFor="context">Where?</Label>
              <Input
                id="context"
                name="context"
                defaultValue={context}
                placeholder="Screen or document (optional)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">What should QA look at?</Label>
              <Textarea id="message" name="message" required rows={4} />
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
