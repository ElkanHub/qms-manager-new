"use client";

import Link from "next/link";

import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardCheck } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { ActionForm } from "@/app/_components/ActionForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { qaApprove, requestChanges, rejectRequest } from "@/app/(org)/documents/actions";

export type QaReviewRow = {
  id: string;
  documentId: string;
  number: string;
  title: string;
  submittedBy: string;
  mine: boolean;
};

const SOD_NOTE =
  "QA cannot approve its own submissions — a different QA reviewer must sign off (segregation of duties).";

// Row-expand review sheet (side="right") so the queue worker keeps list position.
function ReviewSheet({ r }: { r: QaReviewRow }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          Review
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            <span className="font-mono text-xs text-muted-foreground">{r.number}</span>{" "}
            {r.title}
          </SheetTitle>
          <SheetDescription>{SOD_NOTE}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Approve</h3>
            {r.mine ? (
              <>
                <Alert>
                  <AlertDescription>
                    You submitted this — you cannot approve it (segregation of duties).
                  </AlertDescription>
                </Alert>
                <Button disabled>Approve</Button>
              </>
            ) : (
              <ActionForm action={qaApprove} submitLabel="Approve">
                <input type="hidden" name="request_id" value={r.id} />
                <Label className="flex items-center gap-2">
                  <Checkbox name="training_required" /> Training required
                </Label>
                <div className="space-y-1">
                  <Label htmlFor={`eff-${r.id}`}>Effective date</Label>
                  <Input id={`eff-${r.id}`} type="date" name="effective_date" />
                  <p className="text-xs text-muted-foreground">Blank = today.</p>
                </div>
              </ActionForm>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Other decisions</h3>
            <div className="flex flex-wrap gap-2">
              <ReasonDialog
                trigger={<Button variant="outline">Request changes</Button>}
                title="Request changes"
                action={requestChanges}
                submitLabel="Request changes"
                hiddenFields={{ request_id: r.id }}
              />
              <ReasonDialog
                trigger={<Button variant="destructive">Reject</Button>}
                title="Reject draft"
                description="The draft and your reason are preserved for the author."
                action={rejectRequest}
                submitLabel="Reject"
                destructive
                hiddenFields={{ request_id: r.id }}
              />
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const columns: ColumnDef<QaReviewRow>[] = [
  {
    id: "document",
    accessorFn: (r) => `${r.number} ${r.title}`,
    header: "Document",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-mono text-xs text-muted-foreground">{row.original.number}</span>
        <span className="font-medium">{row.original.title}</span>
      </div>
    ),
  },
  {
    id: "submittedBy",
    header: "Submitted by",
    cell: ({ row }) =>
      row.original.mine ? (
        <Badge variant="secondary">you</Badge>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">{row.original.submittedBy}</span>
      ),
  },
  {
    id: "status",
    header: "Status",
    cell: () => <StatusBadge value="pending" kind="signature" dot />,
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/documents/${row.original.documentId}/review`}>Annotate</Link>
        </Button>
        <ReviewSheet r={row.original} />
      </div>
    ),
  },
];

export function QaReviewTable({ rows }: { rows: QaReviewRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKey="document"
      searchPlaceholder="Search number or title…"
      emptyState={
        <EmptyState
          icon={ClipboardCheck}
          message="Nothing awaiting QA review — submitted drafts appear here for approval."
        />
      }
    />
  );
}
