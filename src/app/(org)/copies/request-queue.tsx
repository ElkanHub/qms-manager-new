"use client";

import { useTransition } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { issueCopyRequest, declineCopyRequest } from "@/app/(org)/oversight/actions";

export type RequestRow = {
  id: string;
  document: string;
  copyType: string;
  format: string;
  destination: string;
  quantity: number;
  purpose: string;
  requester: string;
  requestedAt: string;
};

function IssueButton({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set("request_id", requestId);
          const res = await issueCopyRequest(fd);
          if (res.ok) toast.success(res.message ?? "Issued.");
          else toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Check />}
      Issue
    </Button>
  );
}

// C-QA-ISSUE — the incoming copy requests, each with everything QA needs to
// decide on one line: what, which type, where to, how many, and why.
export function RequestQueue({ rows }: { rows: RequestRow[] }) {
  const [listRef] = useAutoAnimate();
  return (
    <ul ref={listRef} className="divide-y">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{r.document}</p>
            <p className="text-xs text-muted-foreground">
              {r.purpose} — {r.requester}, {r.requestedAt}
            </p>
          </div>
          <Badge variant={r.copyType === "uncontrolled" ? "secondary" : "default"}>
            {r.copyType}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {r.quantity} × {r.format} → {r.destination}
          </span>
          <span className="flex gap-2">
            <IssueButton requestId={r.id} />
            <ReasonDialog
              trigger={
                <Button variant="outline" size="sm">
                  Decline
                </Button>
              }
              title="Decline copy request"
              description="The reason goes back to the requester and onto the audit trail."
              action={declineCopyRequest}
              submitLabel="Decline"
              hiddenFields={{ request_id: r.id }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

// Small badge for the requester's own request list.
export function RequestStateBadge({ state, reason }: { state: string; reason: string | null }) {
  if (state === "fulfilled") return <Badge>Issued</Badge>;
  if (state === "declined")
    return (
      <span className="flex items-center gap-2">
        <Badge variant="destructive">Declined</Badge>
        {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
      </span>
    );
  return <Badge variant="secondary">Awaiting QA</Badge>;
}
