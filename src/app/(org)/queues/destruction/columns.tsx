"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/app/status-badge";
import { ConfirmDestructiveDialog } from "@/components/app/confirm-destructive-dialog";
import { destroyVersion } from "@/app/(org)/retire/actions";

export type DestructionRow = {
  id: string; // version id
  number: string;
  title: string;
  revision: string;
  retentionDate: string; // yyyy-mm-dd or "—"
  relLabel: string; // "4 years ago" / "in 3 years"
  progress: number; // 0..100
  unlocked: boolean;
  retentionNote: string; // for the confirm dialog
  unlockLabel: string; // tooltip text for locked rows
};

// D-DESTRUCTION columns. Identity + revision + retention-progress + status + action.
// The time-gate is display-here / enforced server-side: locked rows show a Lock
// tooltip; only unlocked rows expose the type-to-confirm Destroy dialog.
export const columns: ColumnDef<DestructionRow>[] = [
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
    accessorKey: "revision",
    header: "Revision",
    cell: ({ row }) => <span className="tabular-nums">{row.original.revision}</span>,
  },
  {
    id: "retention",
    header: "Retention",
    cell: ({ row }) => (
      <div className="w-40 space-y-1">
        <Progress value={row.original.progress} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="tabular-nums">{row.original.retentionDate}</span>
          <span>{row.original.relLabel}</span>
        </div>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: () => <StatusBadge value="retained" kind="version" dot />,
  },
  {
    id: "action",
    header: "",
    cell: ({ row }) => {
      const r = row.original;
      if (!r.unlocked) {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex text-muted-foreground">
                  <Lock className="size-4" aria-label="Time-locked" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{r.unlockLabel}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      return (
        <ConfirmDestructiveDialog
          confirmValue={r.number}
          retentionNote={r.retentionNote}
          action={destroyVersion}
          hiddenFields={{ version_id: r.id }}
          trigger={
            <Button variant="destructive" size="sm">
              Destroy…
            </Button>
          }
        />
      );
    },
  },
];
