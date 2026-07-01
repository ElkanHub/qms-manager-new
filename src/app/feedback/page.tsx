import { requireOrgUser } from "@/lib/auth";
import { ActionForm } from "@/app/_components/ActionForm";
import { flagFeedback } from "./actions";

// S-FEEDBACK — the one in-app "flag this" path. Feedback writes through the
// audit primitive (feedback.flagged on the tenant chain), so it is append-only,
// attributable, and visible to QA in the audit viewer alongside everything else.
export default async function Feedback() {
  await requireOrgUser();

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Flag this</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Something wrong, confusing, or missing? Tell QA. Your note lands on the audit
        trail, attributed to you.
      </p>
      <div className="mt-6">
        <ActionForm action={flagFeedback} submitLabel="Flag it">
          <input name="context" placeholder="Where? (screen or document, optional)"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <textarea name="message" required rows={4} placeholder="What should QA look at?"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </ActionForm>
      </div>
    </main>
  );
}
