"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Lock as LockIcon } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";

export type MasterRow = {
  isLocked?: boolean;
  id: string;
  number: string;
  title: string;
  department: string;
  status: string;
};

// Columns for the Master Index DataTable. This is the canonical column pattern
// (identity cell first = number mono + title medium; a StatusBadge column always
// present) referenced by the other list screens (UI_BUILD_PLAN §6.2).
export const columns: ColumnDef<MasterRow>[] = [
  {
    id: "document",
    accessorFn: (r) => `${r.number} ${r.title}`,
    header: "Document",
    cell: ({ row }) => (
      <Link href={`/documents/${row.original.id}`} className="flex flex-col" onClick={(e) => e.stopPropagation()}>
        <span className="font-mono text-xs text-muted-foreground">{row.original.number}</span>
        <span className="flex items-center gap-1.5 font-medium">
          {row.original.title}
          {row.original.isLocked && <LockIcon className="size-3.5 text-muted-foreground" aria-label="Restricted" />}
        </span>
      </Link>
    ),
  },
  {
    accessorKey: "department",
    header: "Department",
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge value={row.original.status} kind="document" dot />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
];
