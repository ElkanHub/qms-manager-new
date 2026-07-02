"use client";

import { useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { approveRetirement, withdrawRetirement } from "@/app/(org)/retire/actions";

type Result = { ok: true; message?: string } | { ok: false; error: string };

export type RetirementRow = {
  id: string;
  number: string;
  title: string;
  status: string;
  justification: string | null;
  precheck: Record<string, unknown>;
};

const humanize = (key: string) =>
  key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// Fires a retirement server action with transition + toast feedback (§10: every
// mutation gives feedback). Neither approve nor withdraw takes a reason today.
function ActionButton({
  id,
  action,
  label,
  disabled,
}: {
  id: string;
  action: (fd: FormData) => Promise<Result>;
  label: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("retirement_id", id);
          const r = await action(fd);
          if (r.ok) toast.success(r.message ?? "Done.");
          else toast.error(r.error);
        })
      }
    >
      {pending && <Loader2 className="animate-spin" />}
      {label}
    </Button>
  );
}

function ReviewSheet({ row }: { row: RetirementRow }) {
  const entries = Object.entries(row.precheck);
  const allPass = entries.length > 0 && entries.every(([, v]) => Boolean(v));

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
          Review
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm text-muted-foreground">
            {row.number}
          </SheetTitle>
          <SheetDescription className="text-base font-medium text-foreground">
            {row.title}
          </SheetDescription>
        </SheetHeader>

        {row.justification && (
          <p className="mt-4 text-sm text-muted-foreground">{row.justification}</p>
        )}

        <div className="mt-6">
          <p className="mb-2 text-sm font-medium">Pre-checks</p>
          <ul className="space-y-2 text-sm">
            {entries.length === 0 && (
              <li className="text-muted-foreground">No pre-checks recorded yet.</li>
            )}
            {entries.map(([key, value]) => (
              <li key={key} className="flex items-center gap-2">
                {value ? (
                  <Check className="size-4 shrink-0 text-status-effective" />
                ) : (
                  <X className="size-4 shrink-0 text-destructive" />
                )}
                <span>{humanize(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          {row.status === "retirement_requested" &&
            (allPass ? (
              <ActionButton id={row.id} action={approveRetirement} label="Approve" />
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <ActionButton
                        id={row.id}
                        action={approveRetirement}
                        label="Approve"
                        disabled
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>All pre-checks must pass first</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          {row.status === "retirement_approved" && (
            <ActionButton
              id={row.id}
              action={withdrawRetirement}
              label="Withdraw from use"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const columns: ColumnDef<RetirementRow>[] = [
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
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge value={row.original.status} kind="retirement" dot />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => (
      <div className="text-right">
        <ReviewSheet row={row.original} />
      </div>
    ),
  },
];

export function RetirementsTable({ rows }: { rows: RetirementRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      searchKey="document"
      searchPlaceholder="Search number or title…"
      emptyState={
        <EmptyState
          icon={Archive}
          message="No retirement requests — requests to retire an effective document appear here for pre-check."
        />
      }
    />
  );
}
