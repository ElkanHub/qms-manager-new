"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { StatusBadge } from "@/components/app/status-badge";

export type TenantRow = {
  id: string;
  name: string;
  status: string;
  created: string;
};

// Columns for the platform Tenants list. No detail route exists yet, so the
// identity cell is plain text (no link) — add an onRowHref once tenant detail lands.
export const columns: ColumnDef<TenantRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge value={row.original.status} dot />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "created",
    header: "Created",
    cell: ({ row }) => <span className="tabular-nums">{row.original.created}</span>,
  },
];
