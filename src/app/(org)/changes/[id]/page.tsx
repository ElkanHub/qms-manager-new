import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import {
  beginScreening, requestClarification, rejectChange, submitImpact, classifyChange,
  approveForWork, openDocumentWork, reviewDocument, applySignature, waiveSignature,
  reconcile, releaseTraining, enterEffectivenessReview, closeChange,
} from "../actions";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { StateTimeline, type TimelineStage } from "@/components/app/state-timeline";
import { InitialsSignature } from "@/components/app/initials-signature";
import { SignaturePicker } from "./signature-picker";
import { StatusBadge } from "@/components/app/status-badge";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Check } from "lucide-react";

// D-CHANGE-WORK — the change-control workstation (UI_BUILD_PLAN §7.6). Composes the
// state-appropriate sub-surfaces by status; only what's actionable now renders. Every
// action is server-guarded — this is ergonomics, not authority.

// Pipe stages and where each engine status sits on the spine.
const STAGES = [
  "Submitted", "Screening", "Impact", "Classified", "Document work",
  "Signatures", "Reconciliation", "Effective", "Effectiveness review", "Closed",
] as const;
const STAGE_AT: Record<string, number> = {
  submitted: 1, clarification_requested: 1, impact_pending: 2, classified: 3,
  approved_for_document_work: 4, documents_in_review: 4, queued: 4,
  signatures_pending: 5, pending_reconciliation: 6, pending_training: 6,
  effective: 7, effectiveness_review: 8, closed: 9, rejected: -1,
};

export default async function ChangeWorkstation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roles = await getMyRoles();
  const isQA = roles.includes("qa");
  const isAdmin = roles.includes("org_admin");
  const supabase = await createClient();

  const { data: cc } = await supabase
    .from("change_controls")
    .select("id, type, status, classification, proposed_class, impact_assessment, reason")
    .eq("id", id).maybeSingle();
  if (!cc) {
    return (
      <div className="mx-auto max-w-4xl p-2">
        <PageHeader title="Change control not found" description="It doesn't exist or is out of your scope." />
      </div>
    );
  }

  const { data: ccDocs } = await supabase
    .from("change_control_documents")
    .select("document_id, target_version_id, needs_training, reviewed")
    .eq("change_control_id", id);
  const docIds = (ccDocs ?? []).map((d) => d.document_id);
  const { data: docs } = docIds.length
    ? await supabase.from("documents").select("id, document_number, title").in("id", docIds)
    : { data: [] };
  const docOf = (x: string) => docs?.find((d) => d.id === x);
  const { data: sigs } = await supabase
    .from("signatures")
    .select("role_key, signatory_id, signed_at, waived, waiver_reason, signature_kind")
    .eq("change_control_id", id);

  // The signing surface: the caller's own recorded signature (to choose from)
  // and every signatory's, so applied signatures render as what was signed.
  const me = await requireOrgUser();
  const signatoryIds = [...new Set([me.id, ...(sigs ?? []).map((x) => x.signatory_id).filter(Boolean)])] as string[];
  const [{ data: sigImages }, { data: signers }] = await Promise.all([
    signatoryIds.length
      ? supabase.from("user_signatures").select("user_id, image_data").in("user_id", signatoryIds)
      : Promise.resolve({ data: [] as { user_id: string; image_data: string }[] }),
    signatoryIds.length
      ? supabase.from("users").select("id, full_name, email").in("id", signatoryIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
  ]);
  const sigImageOf = (uid: string | null) => sigImages?.find((x) => x.user_id === uid)?.image_data ?? null;
  const nameOf = (uid: string | null) => {
    const u = signers?.find((x) => x.id === uid);
    return u?.full_name ?? u?.email ?? "";
  };

  // The reconciliation worklist: every issued copy of the outgoing versions,
  // with only controlled/display marked blocking (uncontrolled never blocks).
  const { data: outstandingCopies } =
    cc.status === "pending_reconciliation"
      ? await supabase.rpc("outstanding_copies_for_cc", { p_cc: id })
      : { data: null };
  const allCopies = (outstandingCopies ?? []) as {
    copy_id: string; copy_number: number; holder: string; purpose: string | null;
    copy_type: string; blocking: boolean; document_number: string | null; title: string;
  }[];
  const outstanding = allCopies.filter((c) => c.blocking);
  const staleInfo = allCopies.filter((c) => !c.blocking);

  const s = cc.status;
  const at = STAGE_AT[s] ?? 0;
  const isDetour = s === "clarification_requested" || s === "queued";
  const stages: TimelineStage[] = STAGES.map((label, i) => ({
    label,
    state:
      at < 0 ? "upcoming"
      : i < at ? "done"
      : i === at ? (isDetour ? "detour" : "current")
      : "upcoming",
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        overline={`${cc.type}${cc.classification ? ` · ${cc.classification}` : ""}`}
        title={`Change control CC-${id.slice(0, 8)}`}
        description={cc.reason}
        status={s}
      />

      <SectionCard>
        <StateTimeline stages={stages} />
      </SectionCard>

      {/* D-CHANGE-SCREEN */}
      {isQA && (s === "submitted" || s === "clarification_requested") && (
        <SectionCard title="Screening">
          <div className="flex flex-wrap items-start gap-3">
            <ActionForm action={beginScreening} submitLabel="Begin screening"><Cc id={id} /></ActionForm>
            <ReasonDialog
              trigger={<Button variant="outline">Request clarification</Button>}
              title="Request clarification"
              action={requestClarification}
              submitLabel="Request clarification"
              hiddenFields={{ cc: id }}
            />
            <ReasonDialog
              trigger={<Button variant="destructive">Reject</Button>}
              title="Reject change control"
              action={rejectChange}
              submitLabel="Reject"
              destructive
              hiddenFields={{ cc: id }}
            />
          </div>
        </SectionCard>
      )}

      {/* D-IMPACT (hard gate) + classify */}
      {isQA && s === "impact_pending" && (
        <>
          <SectionCard title="Impact assessment">
            <Alert className="mb-4">
              <AlertDescription>
                All fields must be substantive — classification is blocked until the assessment is complete.
              </AlertDescription>
            </Alert>
            <ActionForm action={submitImpact} submitLabel="Save impact">
              <Cc id={id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="documents_affected">Documents affected</Label>
                  <Input id="documents_affected" name="documents_affected" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="systems_touched">Systems / equipment touched (or “none”)</Label>
                  <Input id="systems_touched" name="systems_touched" required />
                </div>
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Toggle name="training_required" label="Training required" />
                <Toggle name="templates_affected" label="Executed-record templates affected" />
                <Toggle name="revalidation_needed" label="Revalidation may be needed" />
                <Toggle name="regulatory_notification" label="Regulatory notification may be needed" />
              </div>
            </ActionForm>
          </SectionCard>

          <SectionCard title="Classify">
            <ActionForm action={classifyChange} submitLabel="Classify">
              <Cc id={id} />
              <div className="space-y-1.5">
                <Label htmlFor="class">Classification</Label>
                <Select name="class" defaultValue={cc.proposed_class ?? "minor"}>
                  <SelectTrigger id="class" className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minor">Minor</SelectItem>
                    <SelectItem value="major">Major</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reason">Override reason (required only if overriding the proposed class)</Label>
                <Input id="reason" name="reason" />
              </div>
            </ActionForm>
            {cc.proposed_class && (
              <p className="mt-2 text-xs text-muted-foreground">
                System-proposed classification: <StatusBadge value={cc.proposed_class} className="ml-1" />
              </p>
            )}
          </SectionCard>
        </>
      )}

      {isQA && s === "classified" && (
        <SectionCard title="Approve for document work">
          <ActionForm action={approveForWork} submitLabel="Approve for work"><Cc id={id} /></ActionForm>
        </SectionCard>
      )}

      {isQA && s === "approved_for_document_work" && (
        <SectionCard title="Open document work">
          <ActionForm action={openDocumentWork} submitLabel="Open document work"><Cc id={id} /></ActionForm>
        </SectionCard>
      )}

      {/* Per-document review */}
      {isQA && s === "documents_in_review" && (
        <SectionCard title="Document review">
          <ul className="space-y-2">
            {(ccDocs ?? []).map((d) => (
              <li key={d.document_id} className="flex items-center justify-between gap-4 text-sm">
                <span>
                  <span className="font-mono text-xs text-muted-foreground">{docOf(d.document_id)?.document_number ?? "—"}</span>{" "}
                  {docOf(d.document_id)?.title}
                  {d.needs_training && <span className="ml-2 text-xs text-status-blocked">needs training</span>}
                </span>
                {d.reviewed ? (
                  <span className="inline-flex items-center gap-1 text-xs text-status-effective">
                    <Check className="size-3.5" /> reviewed
                  </span>
                ) : (
                  <form action={async (fd) => { "use server"; await reviewDocument(fd); }}>
                    <input type="hidden" name="cc" value={id} />
                    <input type="hidden" name="document_id" value={d.document_id} />
                    <Button size="sm">Review</Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* D-SIGN */}
      {s === "signatures_pending" && (
        <SectionCard title="Signatures">
          <ul className="mb-4 divide-y">
            {(sigs ?? []).map((sig) => (
              <li key={sig.role_key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-medium">{sig.role_key}</span>
                {sig.signed_at ? (
                  <span className="flex items-center gap-2">
                    {sig.signature_kind === "initials" ? (
                      <InitialsSignature fullName={nameOf(sig.signatory_id)} className="h-10 min-w-16 text-base" />
                    ) : sigImageOf(sig.signatory_id) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- small data URL
                      <img
                        src={sigImageOf(sig.signatory_id)!}
                        alt={`Signature of ${nameOf(sig.signatory_id)}`}
                        className="h-10 rounded border bg-white object-contain px-1"
                      />
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {nameOf(sig.signatory_id)} · signed
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {sig.waived ? `waived (${sig.waiver_reason})` : "pending"}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <SignaturePicker ccId={id} fullName={me.full_name ?? me.email} mySignature={sigImageOf(me.id)} />
          {isAdmin && (
            <div className="mt-4">
              <ReasonDialog
                trigger={<Button variant="outline">Waive a signature (admin)</Button>}
                title="Waive a signature"
                description="Admin only — recorded on the audit trail."
                action={waiveSignature}
                submitLabel="Waive"
                hiddenFields={{ cc: id }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="role">Role to waive (e.g. signatory)</Label>
                  <Input id="role" name="role" required />
                </div>
              </ReasonDialog>
            </div>
          )}
        </SectionCard>
      )}

      {/* D-RECONCILE */}
      {isQA && s === "pending_reconciliation" && (
        <SectionCard title="Reconciliation" description="Confirms every controlled and display copy of the outgoing versions is accounted for (uncontrolled copies never block). Trivially satisfied when the copy register module is off.">
          {outstanding.length > 0 ? (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                <p className="mb-2 font-medium">
                  {outstanding.length} controlled {outstanding.length === 1 ? "copy" : "copies"} still
                  outstanding — reconcile {outstanding.length === 1 ? "it" : "them"} on the{" "}
                  <a href="/copies" className="underline">register</a> first:
                </p>
                <ul className="space-y-1 text-sm">
                  {outstanding.map((c) => (
                    <li key={c.copy_id}>
                      <span className="font-mono text-xs">#{c.copy_number}</span>{" "}
                      {c.document_number ?? "—"} · {c.title} — held by <strong>{c.holder}</strong>
                      {c.purpose ? ` (${c.purpose})` : ""}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">
              Nothing outstanding on the copy register for the affected documents.
            </p>
          )}
          {staleInfo.length > 0 && (
            <p className="mb-4 text-sm text-muted-foreground">
              {staleInfo.length} uncontrolled {staleInfo.length === 1 ? "copy" : "copies"} will go
              stale with this change ({staleInfo.map((c) => c.holder).join(", ")}) — recorded on the
              register, never blocking.
            </p>
          )}
          <ActionForm action={reconcile} submitLabel="Reconcile">
            <Cc id={id} />
            {outstanding.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="force_reason">Force-override reason (recorded on the audit trail)</Label>
                <Input id="force_reason" name="force_reason" />
              </div>
            )}
          </ActionForm>
        </SectionCard>
      )}

      {isQA && s === "pending_training" && (
        <SectionCard title="Training release">
          <ActionForm action={releaseTraining} submitLabel="Release after training"><Cc id={id} /></ActionForm>
        </SectionCard>
      )}

      {isQA && s === "effective" && (
        <SectionCard title="Effectiveness review">
          <ActionForm action={enterEffectivenessReview} submitLabel="Enter effectiveness review"><Cc id={id} /></ActionForm>
        </SectionCard>
      )}

      {/* D-EFFECTIVENESS */}
      {isQA && s === "effectiveness_review" && (
        <SectionCard title="Confirm effectiveness & close" description="The reviewer cannot be the change requester (enforced).">
          <ReasonDialog
            trigger={<Button>Confirm &amp; close</Button>}
            title="Confirm effectiveness & close"
            action={closeChange}
            submitLabel="Confirm & close"
            hiddenFields={{ cc: id }}
          />
        </SectionCard>
      )}

      {(s === "closed" || s === "rejected" || s === "queued") && (
        <SectionCard>
          <p className="text-sm text-muted-foreground">
            {s === "queued"
              ? "Queued behind another open change on an affected document."
              : `This change is ${s}.`}
          </p>
        </SectionCard>
      )}
    </div>
  );
}

function Cc({ id }: { id: string }) { return <input type="hidden" name="cc" value={id} />; }

// Boolean control for the impact gate. Radix Switch with a `name` submits "on"
// when checked (matching the engine's truthy read), same as the old checkbox.
function Toggle({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch name={name} />
      {label}
    </label>
  );
}
