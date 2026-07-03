"use client";

import { useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/app/status-badge";
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
  holder: string;
  purpose: string | null;
  issuedDate: string;
  status: string;
  method: string | null;
  note: string | null;
  recallDue: boolean;
  canReconcile: boolean;
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

// Controlled-copy register columns (UI_BUILD_PLAN §7.8): identity = copy # mono,
// then document/version, holder, purpose, issued date, status (with a recall-due
// flag when the underlying version is no longer effective), and reconcile.
export const columns: ColumnDef<CopyRow>[] = [
  {
    accessorKey: "copyNumber",
    header: "Copy #",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.copyNumber}</span>,
  },
  {
    accessorKey: "document",
    header: "Document / version",
    cell: ({ row }) => <span className="font-medium">{row.original.document}</span>,
  },
  {
    accessorKey: "holder",
    header: "Holder",
  },
  {
    accessorKey: "purpose",
    header: "Purpose",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.purpose ?? "—"}</span>
    ),
  },
  {
    accessorKey: "issuedDate",
    header: "Issued",
    cell: ({ row }) => <span className="tabular-nums">{row.original.issuedDate}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <StatusBadge value={row.original.status} kind="version" dot />
        {row.original.recallDue && <Badge variant="destructive">Recall due</Badge>}
        {row.original.method && (
          <span className="text-xs text-muted-foreground" title={row.original.note ?? undefined}>
            {row.original.method}
          </span>
        )}
      </span>
    ),
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    id: "reconcile",
    header: "",
    cell: ({ row }) =>
      row.original.canReconcile ? <ReconcileDialog copyId={row.original.id} /> : null,
  },
];
