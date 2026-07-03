"use client";

import Link from "next/link";

import type { ColumnDef } from "@tanstack/react-table";
import { Stamp } from "lucide-react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { ActionForm } from "@/app/_components/ActionForm";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { endorse, requestChanges } from "@/app/(org)/documents/actions";

export type EndorseRow = {
  id: string;
  documentId: string;
  number: string;
  title: string;
  author: string;
  reason: string | null;
  contentRef: string | null;
  mine: boolean;
};

const MINE_NOTE =
  "You submitted this — endorsement is logged as skipped and routes to a peer HOD or QA. You cannot endorse your own submission.";

// Row-expand endorsement sheet (side="right"); the identity cell is the trigger so
// clicking the row's document opens it without losing queue position.
function EndorseSheet({ r }: { r: EndorseRow }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className="flex flex-col text-left">
          <span className="font-mono text-xs text-muted-foreground">{r.number}</span>
          <span className="font-medium">{r.title}</span>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            <span className="font-mono text-xs text-muted-foreground">{r.number}</span>{" "}
            {r.title}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Author</dt>
              <dd>{r.author}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Reason for change</dt>
              <dd>{r.reason || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Content</dt>
              <dd>
                {r.contentRef ? (
                  <a
                    href={r.contentRef}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all underline underline-offset-2"
                  >
                    {r.contentRef}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Endorse</h3>
            {r.mine ? (
              <>
                <Alert>
                  <AlertDescription>{MINE_NOTE}</AlertDescription>
                </Alert>
                <Button disabled>Endorse</Button>
              </>
            ) : (
              <ActionForm action={endorse} submitLabel="Endorse">
                <input type="hidden" name="request_id" value={r.id} />
              </ActionForm>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Other decisions</h3>
            <Button variant="outline" asChild className="mr-2">
              <Link href={`/documents/${r.documentId}/review`}>Annotate the draft</Link>
            </Button>
            <ReasonDialog
              action={requestChanges}
              title="Request changes"
              submitLabel="Request changes"
              hiddenFields={{ request_id: r.id }}
              trigger={<Button variant="outline">Request changes</Button>}
            />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const columns: ColumnDef<EndorseRow>[] = [
  {
    id: "document",
    accessorFn: (r) => `${r.number} ${r.title}`,
    header: "Document",
    cell: ({ row }) => <EndorseSheet r={row.original} />,
  },
  {
    id: "status",
    header: "Status",
    cell: () => <StatusBadge value="pending" kind="signature" dot />,
  },
];

export function EndorseTable({ rows }: { rows: EndorseRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKey="document"
      searchPlaceholder="Search number or title…"
      emptyState={
        <EmptyState
          icon={Stamp}
          message="No submissions awaiting endorsement — drafts from employees in your department appear here."
        />
      }
    />
  );
}
