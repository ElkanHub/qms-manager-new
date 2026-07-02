"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export type ChangeRow = {
  id: string;
  shortId: string;
  type: string;
  classification: string; // "minor" | "major" | "critical" | "—"
  status: string;
  docs: string[]; // affected document numbers
  requestedBy: string;
  age: string; // relative label, e.g. "3 days ago"
};

// Columns for the change-controls list (UI_BUILD_PLAN §7.6). Identity cell = CC
// short id (mono); a StatusBadge column drives the status facet.
export const columns: ColumnDef<ChangeRow>[] = [
  {
    id: "cc",
    accessorKey: "shortId",
    header: "CC",
    cell: ({ row }) => (
      <Link
        href={`/changes/${row.original.id}`}
        className="font-mono text-xs text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.shortId}
      </Link>
    ),
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => <span className="font-medium">{row.original.type}</span>,
  },
  {
    accessorKey: "classification",
    header: "Class",
    cell: ({ row }) =>
      row.original.classification === "—" ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <Badge variant="outline">{row.original.classification}</Badge>
      ),
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge value={row.original.status} kind="change" dot />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    id: "documents",
    accessorFn: (r) => r.docs.length,
    header: "Documents",
    cell: ({ row }) => {
      const docs = row.original.docs;
      if (!docs.length) return <span className="text-muted-foreground tabular-nums">0</span>;
      return (
        <HoverCard>
          <HoverCardTrigger onClick={(e) => e.stopPropagation()} className="cursor-default tabular-nums underline decoration-dotted underline-offset-2">
            {docs.length}
          </HoverCardTrigger>
          <HoverCardContent className="w-auto min-w-40">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Affected documents</p>
            <ul className="space-y-0.5 font-mono text-xs">
              {docs.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </HoverCardContent>
        </HoverCard>
      );
    },
  },
  {
    accessorKey: "requestedBy",
    header: "Requested by",
  },
  {
    accessorKey: "age",
    header: "Age",
    cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.age}</span>,
  },
];
