"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { concludeReview } from "@/app/(org)/oversight/actions";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type PeriodicRow = {
  id: string;
  number: string;
  title: string;
  due: string;
  overdue: boolean;
};

// Outcome picker for the Conclude dialog. Radix RadioGroup with `name` submits
// `outcome` as a form field; the revise note appears only when revise is chosen.
function OutcomeField() {
  const [outcome, setOutcome] = useState("no_change");
  return (
    <div className="space-y-2">
      <Label>Outcome</Label>
      <RadioGroup name="outcome" value={outcome} onValueChange={setOutcome}>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="no_change" id="oc-no-change" />
          <Label htmlFor="oc-no-change" className="font-normal">No change — reschedule</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="revise" id="oc-revise" />
          <Label htmlFor="oc-revise" className="font-normal">Revise</Label>
        </div>
      </RadioGroup>
      {outcome === "revise" && (
        <p className="text-xs text-muted-foreground">
          A change control will be raised, and linked here after.
        </p>
      )}
    </div>
  );
}

export const columns: ColumnDef<PeriodicRow>[] = [
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
    accessorKey: "due",
    header: "Due date",
    cell: ({ row }) => <span className="tabular-nums">{row.original.due}</span>,
  },
  {
    id: "overdue",
    header: "",
    cell: ({ row }) =>
      row.original.overdue ? <Badge variant="destructive">Overdue</Badge> : null,
  },
  {
    id: "conclude",
    header: "",
    cell: ({ row }) => (
      <ReasonDialog
        trigger={<Button size="sm" variant="outline">Conclude</Button>}
        title="Conclude review"
        description="Record the outcome of this periodic review."
        action={concludeReview}
        submitLabel="Conclude"
        hiddenFields={{ document_id: row.original.id }}
      >
        <OutcomeField />
      </ReasonDialog>
    ),
  },
];
