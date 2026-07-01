import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import {
  beginScreening, requestClarification, rejectChange, submitImpact, classifyChange,
  approveForWork, openDocumentWork, reviewDocument, applySignature, waiveSignature,
  reconcile, releaseTraining, enterEffectivenessReview, closeChange,
} from "../actions";

// D-CHANGE-WORK — the change-control workstation. Composes the state-appropriate
// sub-surfaces (D-CHANGE-SCREEN, D-IMPACT, D-SIGN, D-RECONCILE, D-EFFECTIVENESS) by
// status. Every action is server-guarded; this only surfaces what's actionable now.
export default async function ChangeWorkstation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOrgUser();
  const roles = await getMyRoles();
  const isQA = roles.includes("qa");
  const isAdmin = roles.includes("org_admin");
  const supabase = await createClient();

  const { data: cc } = await supabase
    .from("change_controls")
    .select("id, type, status, classification, proposed_class, impact_assessment, reason")
    .eq("id", id).maybeSingle();
  if (!cc) return <main className="mx-auto max-w-2xl p-8"><p className="text-sm text-neutral-600">Change control not found or out of scope.</p></main>;

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
    .from("signatures").select("role_key, signatory_id, signed_at, waived, waiver_reason").eq("change_control_id", id);

  const s = cc.status;
  return (
    <main className="mx-auto max-w-2xl p-8">
      <p className="text-sm text-neutral-500">{cc.type}{cc.classification ? ` · ${cc.classification}` : ""}</p>
      <h1 className="text-2xl font-semibold">Change control</h1>
      <p className="mt-1 text-sm text-neutral-600">{cc.reason}</p>
      <p className="mt-2 inline-block rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium uppercase text-white">{s}</p>

      {/* D-CHANGE-SCREEN */}
      {isQA && (s === "submitted" || s === "clarification_requested") && (
        <Section title="Screening">
          <ActionForm action={beginScreening} submitLabel="Begin screening"><Cc id={id} /></ActionForm>
          <ActionForm action={requestClarification} submitLabel="Request clarification">
            <Cc id={id} /><Reason />
          </ActionForm>
          <ActionForm action={rejectChange} submitLabel="Reject"><Cc id={id} /><Reason /></ActionForm>
        </Section>
      )}

      {/* D-IMPACT (hard gate) + classify */}
      {isQA && s === "impact_pending" && (
        <>
          <Section title="Impact assessment (all fields required — hard gate)">
            <ActionForm action={submitImpact} submitLabel="Save impact">
              <Cc id={id} />
              <input name="documents_affected" required placeholder="Documents affected"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
              <input name="systems_touched" required placeholder="Systems/equipment touched (or 'none')"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
              <Check name="training_required" label="Training required" />
              <Check name="templates_affected" label="Executed-record templates affected" />
              <Check name="revalidation_needed" label="Revalidation may be needed" />
              <Check name="regulatory_notification" label="Regulatory notification may be needed" />
            </ActionForm>
          </Section>
          <Section title="Classify">
            <ActionForm action={classifyChange} submitLabel="Classify">
              <Cc id={id} />
              <select name="class" defaultValue={cc.proposed_class ?? "minor"}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
                <option value="minor">minor</option><option value="major">major</option><option value="critical">critical</option>
              </select>
              <input name="reason" placeholder="Reason (required only if overriding the proposed class)"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
            </ActionForm>
            {cc.proposed_class && <p className="text-xs text-neutral-500">System-proposed: {cc.proposed_class}</p>}
          </Section>
        </>
      )}

      {isQA && s === "classified" && (
        <Section title="Approve for document work">
          <ActionForm action={approveForWork} submitLabel="Approve for work"><Cc id={id} /></ActionForm>
        </Section>
      )}

      {isQA && s === "approved_for_document_work" && (
        <Section title="Open document work">
          <ActionForm action={openDocumentWork} submitLabel="Open document work"><Cc id={id} /></ActionForm>
        </Section>
      )}

      {/* Per-document review */}
      {isQA && s === "documents_in_review" && (
        <Section title="Document review">
          {(ccDocs ?? []).map((d) => (
            <div key={d.document_id} className="flex items-center justify-between text-sm">
              <span>{docOf(d.document_id)?.document_number ?? "—"} {docOf(d.document_id)?.title}</span>
              {d.reviewed ? <span className="text-xs text-green-700">reviewed</span> : (
                <form action={async (fd) => { "use server"; await reviewDocument(fd); }}>
                  <input type="hidden" name="cc" value={id} />
                  <input type="hidden" name="document_id" value={d.document_id} />
                  <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs text-white">Review</button>
                </form>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* D-SIGN */}
      {s === "signatures_pending" && (
        <Section title="Signatures">
          <ul className="text-sm">
            {(sigs ?? []).map((sig) => (
              <li key={sig.role_key} className="flex items-center justify-between border-b border-neutral-100 py-1">
                <span className="font-medium">{sig.role_key}</span>
                <span className="text-xs text-neutral-500">
                  {sig.signed_at ? "signed" : sig.waived ? `waived (${sig.waiver_reason})` : "pending"}
                </span>
              </li>
            ))}
          </ul>
          <ActionForm action={applySignature} submitLabel="Sign (my required role)">
            <Cc id={id} />
            <input name="meaning" required placeholder="Meaning of signature (e.g. reviewed / approved)"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </ActionForm>
          {isAdmin && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="mb-1 text-xs font-semibold text-amber-800">Waive a signature (admin — logged)</p>
              <ActionForm action={waiveSignature} submitLabel="Waive">
                <Cc id={id} />
                <input name="role" required placeholder="Role to waive (e.g. signatory)"
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
                <input name="reason" required placeholder="Reason (required)"
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
              </ActionForm>
            </div>
          )}
        </Section>
      )}

      {/* D-RECONCILE */}
      {isQA && s === "pending_reconciliation" && (
        <Section title="Reconciliation">
          <p className="text-xs text-neutral-500">
            Confirms every issued controlled copy is accounted for. Trivially satisfied when the
            copy register module is off. Force-override requires a reason.
          </p>
          <ActionForm action={reconcile} submitLabel="Reconcile">
            <Cc id={id} />
            <input name="force_reason" placeholder="Force-override reason (only if copies unaccounted)"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </ActionForm>
        </Section>
      )}

      {isQA && s === "pending_training" && (
        <Section title="Training release">
          <ActionForm action={releaseTraining} submitLabel="Release after training"><Cc id={id} /></ActionForm>
        </Section>
      )}

      {isQA && s === "effective" && (
        <Section title="Effectiveness review">
          <ActionForm action={enterEffectivenessReview} submitLabel="Enter effectiveness review"><Cc id={id} /></ActionForm>
        </Section>
      )}

      {/* D-EFFECTIVENESS */}
      {isQA && s === "effectiveness_review" && (
        <Section title="Confirm effectiveness & close">
          <p className="text-xs text-neutral-500">The reviewer cannot be the change requester (enforced).</p>
          <ActionForm action={closeChange} submitLabel="Confirm & close">
            <Cc id={id} /><Reason />
          </ActionForm>
        </Section>
      )}

      {(s === "closed" || s === "rejected" || s === "queued") && (
        <p className="mt-6 text-sm text-neutral-500">
          {s === "queued" ? "Queued behind another open change on an affected document." : `This change is ${s}.`}
        </p>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
function Cc({ id }: { id: string }) { return <input type="hidden" name="cc" value={id} />; }
function Reason() {
  return <input name="reason" required placeholder="Reason (required)"
    className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />;
}
function Check({ name, label }: { name: string; label: string }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} /> {label}</label>;
}
