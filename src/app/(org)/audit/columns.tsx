"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown } from "lucide-react";
import { CopyId } from "@/components/app/copy-id";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type AuditRow = {
  id: string;
  time: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  oldValue: unknown;
  newValue: unknown;
};

const fmt = (iso: string) => new Date(iso).toISOString().replace("T", " ").slice(0, 19);

// Audit viewer columns (UI_BUILD_PLAN §7.9). Time is mono/tabular; Action reads as a
// code token; Entity pairs its type with a copyable short id; Reason truncates behind a
// tooltip; the old→new diff hides behind a per-row Collapsible rendering compact JSON.
export const columns: ColumnDef<AuditRow>[] = [
  {
    accessorKey: "time",
    header: "Time",
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
        {fmt(row.original.time)}
      </span>
    ),
  },
  {
    accessorKey: "actor",
    header: "Actor",
    cell: ({ row }) => <span className="text-sm">{row.original.actor}</span>,
  },
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{row.original.action}</code>
    ),
  },
  {
    id: "entity",
    header: "Entity",
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">{row.original.entityType || "—"}</span>
        {row.original.entityId && <CopyId value={row.original.entityId} short={8} />}
      </div>
    ),
  },
  {
    accessorKey: "reason",
    header: "Reason",
    cell: ({ row }) =>
      row.original.reason ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block max-w-xs truncate text-sm">{row.original.reason}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{row.original.reason}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "diff",
    header: "Diff",
    cell: ({ row }) => {
      const { oldValue, newValue } = row.original;
      if (oldValue == null && newValue == null) return <span className="text-muted-foreground">—</span>;
      return (
        <Collapsible>
          <CollapsibleTrigger className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-180">
            <ChevronDown className="size-3 transition-transform" />
            diff
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-2 max-w-md overflow-auto rounded bg-muted p-2 font-mono text-xs">
              {JSON.stringify({ old: oldValue, new: newValue }, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      );
    },
  },
];
