"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { startIntake, dispatchIntake, disputeIntake, type StartResult } from "./actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StateTimeline, type TimelineStage } from "@/components/app/state-timeline";
import { SopUpload } from "@/components/app/sop-upload";

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
  const [resume, setResume] = useState(false);

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

  async function confirm(resumeDraft: boolean) {
    if (!started?.ok) return;
    setBusy(true); setError(null);
    const res = await dispatchIntake(started.intakeId, resumeDraft ? started.abandonedDraftId : null);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDone({ documentId: res.documentId, resumed: resumeDraft });
  }

  async function dispute(reason: string) {
    if (!started?.ok) return;
    const res = await disputeIntake(started.intakeId, reason);
    if (!res.ok) return setError(res.error);
    setDisputed(true);
  }

  // Wizard step for the timeline header.
  const step: 0 | 1 | 2 = done || disputed ? 2 : started?.ok ? 1 : 0;
  const stages: TimelineStage[] = [
    { label: "Describe", state: step > 0 ? "done" : "current" },
    { label: "Confirm", state: step > 1 ? "done" : step === 1 ? "current" : "upcoming" },
    { label: "Done", state: step === 2 ? "current" : "upcoming" },
  ];

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <StateTimeline stages={stages} />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Phase 3 — Done / Disputed */}
        {done && (
          <>
            <Alert>
              <CheckCircle2 className="size-4" />
              <AlertTitle>Request dispatched.</AlertTitle>
              <AlertDescription>
                {done.documentId ? (
                  <Link href={`/documents/${done.documentId}/history`} className="underline">
                    Open the {done.resumed ? "resumed" : "new"} document
                  </Link>
                ) : (
                  <span>Routed to the appropriate pipe for QA.</span>
                )}
              </AlertDescription>
            </Alert>
            <p className="text-xs text-muted-foreground">Type locked at dispatch.</p>
          </>
        )}

        {disputed && (
          <Alert>
            <AlertTitle>Dispute submitted.</AlertTitle>
            <AlertDescription>QA will re-evaluate the request type.</AlertDescription>
          </Alert>
        )}

        {/* Phase 2 — Confirm */}
        {!done && !disputed && started?.ok && (
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Inferred type</p>
              <Badge className="text-sm">{started.inferredType}</Badge>
            </div>

            <Alert>
              <AlertTitle>Why this type</AlertTitle>
              <AlertDescription>{RATIONALE[started.inferredType]}</AlertDescription>
            </Alert>

            {started.abandonedDraftId && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm">
                  You have an unfinished draft with this title. Resume it or start fresh.
                </p>
                <RadioGroup
                  value={resume ? "resume" : "fresh"}
                  onValueChange={(v) => setResume(v === "resume")}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="resume" id="resume" />
                    <Label htmlFor="resume">Resume the abandoned draft</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="fresh" id="fresh" />
                    <Label htmlFor="fresh">Start fresh</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => confirm(resume)}>
                Confirm &amp; dispatch
              </Button>
              <DisputeButton onDispute={dispute} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {/* Phase 1 — Describe */}
        {!done && !disputed && !started?.ok && (
          <form action={onCapture} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for this request</Label>
              <Textarea id="reason" name="reason" required rows={2}
                placeholder="Why are you making this request?" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" placeholder="Title (for a new document)" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="targets">Target document(s)</Label>
              {/* ponytail: native multi-select — no shadcn multi-select primitive exists */}
              <select
                id="targets"
                name="targets"
                multiple
                className="flex h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {effectiveDocs.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Leave empty for a new SOP.</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="discontinue" name="discontinue" />
              <Label htmlFor="discontinue">Discontinue the target (retirement)</Label>
            </div>
            <div className="space-y-2">
              <Label>Document content (optional now, required before submission)</Label>
              <SopUpload name="content_ref" />
            </div>
            <Button type="submit" disabled={busy} className="self-start">Continue</Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// Dispute the inferred type — ReasonDialog-style reason flow, routes to QA.
function DisputeButton({ onDispute }: { onDispute: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Dispute type</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispute the inferred type</DialogTitle>
          <DialogDescription>
            Explain why the type is wrong. This routes the request to QA for re-evaluation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="dispute-reason">Reason</Label>
          <Textarea id="dispute-reason" value={reason} rows={4}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is the type wrong?" />
        </div>
        <DialogFooter>
          <Button
            disabled={!reason.trim()}
            onClick={() => { onDispute(reason); setOpen(false); }}
          >
            Send to QA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// TODO prefill from ?target — read page links /intake?target=<id> to preselect a target doc.
