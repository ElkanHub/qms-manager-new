"use client";

import { useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { reconcileCopy } from "@/app/(org)/oversight/actions";

export type CopyRow = {
  id: string;
  copyNumber: string;
  document: string;
  copyType: string;
  format: string;
  holder: string;
  purpose: string | null;
  issuedDate: string;
  liveState: string;
  note: string | null;
  canReconcile: boolean;
};

const TYPE_LABEL: Record<string, string> = {
  controlled: "Controlled",
  display: "Display",
  uncontrolled: "Uncontrolled",
};

// The register's derived state → what the reader should feel about it.
const STATE_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  issued: { label: "Issued", variant: "default" },
  superseded_unreconciled: { label: "Recall due", variant: "destructive" },
  stale_uncontrolled: { label: "May be stale", variant: "secondary" },
  returned: { label: "Returned", variant: "outline" },
  destroyed: { label: "Destroyed", variant: "outline" },
  lost: { label: "Lost", variant: "outline" },
};

// Reconcile dialog: method from the register vocabulary; "lost" demands a
// documented note (the server enforces both — this is ergonomics).
function ReconcileDialog({ copyId }: { copyId: string }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("returned");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await reconcileCopy(formData);
      if (result.ok) {
        toast.success(result.message ?? "Copy reconciled.");
        setOpen(false);
        setError(null);
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
          Reconcile
        </Button>
      </DialogTrigger>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <form action={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Reconcile copy</DialogTitle>
            <DialogDescription>Record how this controlled copy was accounted for.</DialogDescription>
          </DialogHeader>

          <input type="hidden" name="copy_id" value={copyId} />
          <div className="space-y-2">
            <Label htmlFor="method">Method</Label>
            <select
              id="method"
              name="method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="returned">Returned</option>
              <option value="destroyed">Destroyed</option>
              <option value="lost">Lost</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">
              Note {method === "lost" ? "(required — document what happened)" : "(optional)"}
            </Label>
            <Textarea
              id="note"
              name="note"
              required={method === "lost"}
              placeholder={
                method === "lost"
                  ? "e.g. holder left site; copy unrecoverable — QA deviation DV-042"
                  : "Anything worth recording"
              }
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Reconcile
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The register (C-REGISTER): identity = copy # mono, then document, type,
// holder, issued date, derived state, the stamped issue sheet, and reconcile.
export const columns: ColumnDef<CopyRow>[] = [
  {
    accessorKey: "copyNumber",
    header: "Copy #",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.copyNumber}</span>,
  },
  {
    accessorKey: "document",
    header: "Document",
    cell: ({ row }) => <span className="font-medium">{row.original.document}</span>,
  },
  {
    accessorKey: "copyType",
    header: "Type",
    cell: ({ row }) => (
      <span className="text-sm">
        {TYPE_LABEL[row.original.copyType] ?? row.original.copyType}
        <span className="ml-1 text-xs text-muted-foreground">
          {row.original.format === "pdf" ? "· PDF" : "· paper"}
        </span>
      </span>
    ),
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "holder",
    header: "Holder / destination",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.holder}
        {row.original.purpose && (
          <span className="block text-xs text-muted-foreground">{row.original.purpose}</span>
        )}
      </span>
    ),
  },
  {
    accessorKey: "issuedDate",
    header: "Issued",
    cell: ({ row }) => <span className="tabular-nums">{row.original.issuedDate}</span>,
  },
  {
    accessorKey: "liveState",
    header: "Status",
    cell: ({ row }) => {
      const badge = STATE_BADGE[row.original.liveState] ?? {
        label: row.original.liveState,
        variant: "outline" as const,
      };
      return (
        <span className="flex items-center gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {row.original.note && (
            <span className="max-w-[16ch] truncate text-xs text-muted-foreground" title={row.original.note}>
              {row.original.note}
            </span>
          )}
        </span>
      );
    },
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <span className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="icon" asChild aria-label="Issue sheet (PDF)">
          <a href={`/copies/${row.original.id}/sheet`} target="_blank" rel="noreferrer">
            <FileDown className="size-4" />
          </a>
        </Button>
        {row.original.canReconcile && <ReconcileDialog copyId={row.original.id} />}
      </span>
    ),
  },
];
