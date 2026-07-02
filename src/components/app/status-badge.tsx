import { cn } from "@/lib/utils";

// One badge for every status the engine emits (UI_BUILD_PLAN §6.1). Maps each
// engine status string → a Layer-B tone + human label. Unknown statuses render
// neutral with the raw string so a new engine state never crashes the UI.
//
// Tones correspond to the --status-* tokens in globals.css (§2.2). Branding tunes
// the tokens; this map never hardcodes a colour.

type Tone =
  | "draft"
  | "review"
  | "approved"
  | "effective"
  | "blocked"
  | "scheduled"
  | "terminal"
  | "retention"
  | "destroyed";

type Kind =
  | "version"
  | "document"
  | "change"
  | "retirement"
  | "intake"
  | "signature"
  | "training";

const toneClass: Record<Tone, string> = {
  draft: "bg-status-draft/15 text-status-draft border-status-draft/30",
  review: "bg-status-review/15 text-status-review border-status-review/30",
  approved: "bg-status-approved/15 text-status-approved border-status-approved/30",
  effective: "bg-status-effective/15 text-status-effective border-status-effective/30",
  blocked: "bg-status-blocked/15 text-status-blocked border-status-blocked/30",
  scheduled: "bg-status-scheduled/15 text-status-scheduled border-status-scheduled/30",
  terminal: "bg-status-terminal/15 text-status-terminal border-status-terminal/30",
  retention: "bg-status-retention/15 text-status-retention border-status-retention/30",
  destroyed: "bg-status-destroyed/15 text-status-destroyed border-status-destroyed/30",
};

// status string → { tone, label }. Covers documents, versions, change controls,
// retirement, intake, approval requests, training, copies, and shared lifecycle
// states (§2.2 tone groupings).
const statusMap: Record<string, { tone: Tone; label: string }> = {
  // training module (packages + assignments)
  generating: { tone: "scheduled", label: "Generating" },
  draft_review: { tone: "review", label: "Draft review" },
  in_progress: { tone: "scheduled", label: "In progress" },
  awaiting_assessment: { tone: "review", label: "Awaiting assessment" },
  overdue: { tone: "blocked", label: "Overdue" },
  // documents
  draft: { tone: "draft", label: "Draft" },
  in_review: { tone: "review", label: "In review" },
  pending_training: { tone: "blocked", label: "Pending training" },
  scheduled: { tone: "scheduled", label: "Scheduled" },
  active: { tone: "effective", label: "Active" },
  locked_in_cc: { tone: "blocked", label: "Locked in change" },
  retired: { tone: "terminal", label: "Retired" },
  // versions
  in_approval: { tone: "review", label: "In approval" },
  approved: { tone: "approved", label: "Approved" },
  effective: { tone: "effective", label: "Effective" },
  superseded: { tone: "terminal", label: "Superseded" },
  retained: { tone: "retention", label: "Retained" },
  destroyed: { tone: "destroyed", label: "Destroyed" },
  // change controls
  submitted: { tone: "review", label: "Submitted" },
  clarification_requested: { tone: "blocked", label: "Clarification requested" },
  impact_pending: { tone: "review", label: "Impact pending" },
  classified: { tone: "approved", label: "Classified" },
  queued: { tone: "blocked", label: "Queued" },
  approved_for_document_work: { tone: "approved", label: "Approved for work" },
  documents_in_review: { tone: "review", label: "Documents in review" },
  signatures_pending: { tone: "approved", label: "Signatures pending" },
  pending_reconciliation: { tone: "scheduled", label: "Pending reconciliation" },
  effectiveness_review: { tone: "scheduled", label: "Effectiveness review" },
  closed: { tone: "effective", label: "Closed" },
  rejected: { tone: "terminal", label: "Rejected" },
  // retirement
  retirement_requested: { tone: "review", label: "Retirement requested" },
  retirement_approved: { tone: "approved", label: "Retirement approved" },
  pending_destruction: { tone: "retention", label: "Pending destruction" },
  // intake
  capturing: { tone: "draft", label: "Capturing" },
  disputed: { tone: "blocked", label: "Disputed" },
  dispatched: { tone: "approved", label: "Dispatched" },
  // approval requests / signatures
  pending: { tone: "review", label: "Pending" },
  changes_requested: { tone: "blocked", label: "Changes requested" },
  // training
  assigned: { tone: "review", label: "Assigned" },
  completed: { tone: "effective", label: "Completed" },
  // controlled copies
  issued: { tone: "approved", label: "Issued" },
  reconciled: { tone: "effective", label: "Reconciled" },
  // tenant / user / invitation / access-grant lifecycle
  suspended: { tone: "blocked", label: "Suspended" },
  deactivated: { tone: "terminal", label: "Deactivated" },
  accepted: { tone: "effective", label: "Accepted" },
  revoked: { tone: "terminal", label: "Revoked" },
  expired: { tone: "terminal", label: "Expired" },
  open: { tone: "scheduled", label: "Open" },
  denied: { tone: "terminal", label: "Denied" },
  resolved: { tone: "effective", label: "Resolved" },
};

export function StatusBadge({
  value,
  kind: _kind,
  dot = false,
  className,
}: {
  value: string;
  /** Reserved for kind-specific disambiguation; statuses are globally unique today. */
  kind?: Kind;
  /** Dot-prefixed compact variant for dense tables (§6.1). */
  dot?: boolean;
  className?: string;
}) {
  const entry = statusMap[value];
  const tone = entry?.tone ?? "draft";
  const label = entry?.label ?? value;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClass[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {label}
    </span>
  );
}
