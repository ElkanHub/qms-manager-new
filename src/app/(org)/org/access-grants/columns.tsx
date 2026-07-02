"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge } from "@/components/app/status-badge";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { Button } from "@/components/ui/button";
import { decideAccess } from "../actions";

export type AccessRow = {
  id: string;
  purpose: string;
  mode: string;
  status: string;
  requested_at: string | null;
};

const modeLabel = (mode: string) =>
  mode === "org_approved" ? "Org approval" : mode === "self_authorized" ? "Self-authorized" : mode;

// Approve/Deny only surface when this org owns the decision (consent mode) and the
// request is still pending — and only for QA. Both route through decideAccess with a
// required, audited reason (ReasonDialog).
function DecisionActions({ row }: { row: AccessRow }) {
  if (row.mode !== "org_approved" || row.status !== "pending") return null;
  return (
    <div className="flex justify-end gap-2">
      <ReasonDialog
        trigger={<Button size="sm">Approve</Button>}
        title="Approve access request"
        description="Opens platform break-glass access to your organization's data."
        action={decideAccess}
        submitLabel="Approve"
        hiddenFields={{ request_id: row.id, decision: "approve" }}
      />
      <ReasonDialog
        trigger={
          <Button size="sm" variant="outline">
            Deny
          </Button>
        }
        title="Deny access request"
        action={decideAccess}
        submitLabel="Deny"
        destructive
        hiddenFields={{ request_id: row.id, decision: "deny" }}
      />
    </div>
  );
}

export function columns(isQA: boolean): ColumnDef<AccessRow>[] {
  return [
    {
      id: "request",
      accessorFn: (r) => r.purpose,
      header: "Request",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.purpose}</span>
          {row.original.requested_at && (
            <span className="font-mono text-xs text-muted-foreground">
              {new Date(row.original.requested_at).toLocaleDateString()}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "mode",
      header: "Mode",
      cell: ({ row }) => <span className="text-sm">{modeLabel(row.original.mode)}</span>,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge value={row.original.status} dot />,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (isQA ? <DecisionActions row={row.original} /> : null),
    },
  ];
}
