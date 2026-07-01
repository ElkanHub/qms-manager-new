"use client";

import { useState } from "react";
import Link from "next/link";
import { startIntake, dispatchIntake, disputeIntake, type StartResult } from "./actions";

type Doc = { id: string; label: string };
const RATIONALE: Record<string, string> = {
  NEW_SOP: "No effective target selected — this is a brand-new document.",
  CHANGE_SINGLE: "One effective document is targeted — this is a change against it.",
  CHANGE_MULTI: "Several effective documents are targeted — this is a multi-document change.",
  RETIRE: "An effective document is targeted for discontinuation — this is a retirement.",
};

// D-INTAKE — one door. Capture, then show the inferred type + WHY, then confirm
// (dispatch, type locks) or dispute (routes to QA). Surfaces the abandoned-draft fork.
export function IntakeFlow({ effectiveDocs }: { effectiveDocs: Doc[] }) {
  const [started, setStarted] = useState<StartResult | null>(null);
  const [done, setDone] = useState<{ documentId: string | null; resumed: boolean } | null>(null);
  const [disputed, setDisputed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCapture(formData: FormData) {
    setBusy(true); setError(null);
    const res = await startIntake({
      reason: String(formData.get("reason")),
      title: String(formData.get("title") || ""),
      targets: formData.getAll("targets").map(String),
      discontinue: formData.get("discontinue") === "on",
      contentRef: String(formData.get("content_ref") || ""),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setStarted(res);
  }

  async function confirm(resume: boolean) {
    if (!started?.ok) return;
    setBusy(true); setError(null);
    const res = await dispatchIntake(started.intakeId, resume ? started.abandonedDraftId : null);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDone({ documentId: res.documentId, resumed: resume });
  }

  async function dispute(reason: string) {
    if (!started?.ok) return;
    const res = await disputeIntake(started.intakeId, reason);
    if (!res.ok) return setError(res.error);
    setDisputed(true);
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
        <p className="font-medium text-green-800">Request dispatched.</p>
        {done.documentId ? (
          <Link href={`/documents/${done.documentId}/history`} className="underline">
            Open the {done.resumed ? "resumed" : "new"} document
          </Link>
        ) : (
          <p className="text-green-700">Routed to the appropriate pipe for QA.</p>
        )}
      </div>
    );
  }

  if (disputed) {
    return <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      Dispute submitted. QA will re-evaluate the request type.
    </p>;
  }

  if (started?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-sm text-neutral-500">Inferred type</p>
          <p className="text-lg font-semibold">{started.inferredType}</p>
          <p className="mt-1 text-sm text-neutral-600">{RATIONALE[started.inferredType]}</p>
        </div>

        {started.abandonedDraftId && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            You have an unfinished draft with this title. Resume it or start fresh.
            <div className="mt-2 flex gap-2">
              <button disabled={busy} onClick={() => confirm(true)} className="rounded-md bg-neutral-900 px-3 py-1.5 text-white">Resume draft</button>
              <button disabled={busy} onClick={() => confirm(false)} className="rounded-md border border-neutral-300 px-3 py-1.5">Start fresh</button>
            </div>
          </div>
        )}

        {!started.abandonedDraftId && (
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => confirm(false)} className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
              Confirm &amp; dispatch
            </button>
            <DisputeButton onDispute={dispute} />
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <form action={onCapture} className="flex flex-col gap-3">
      <input name="title" placeholder="Title (for a new document)"
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      <textarea name="reason" required placeholder="Reason for this request (required)"
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm" rows={2} />
      <label className="text-sm text-neutral-600">Target document(s) — leave empty for a new SOP</label>
      <select name="targets" multiple className="h-32 rounded-md border border-neutral-300 px-3 py-2 text-sm">
        {effectiveDocs.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="discontinue" /> Discontinue the target (retirement)
      </label>
      <input name="content_ref" placeholder="Content reference / upload URL (optional)"
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      <button type="submit" disabled={busy}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
        Continue
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function DisputeButton({ onDispute }: { onDispute: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-md border border-neutral-300 px-4 py-2 text-sm">Dispute type</button>;
  return (
    <div className="flex w-full gap-2">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the type wrong?"
        className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm" />
      <button disabled={!reason} onClick={() => onDispute(reason)} className="rounded-md bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-40">Send</button>
    </div>
  );
}
