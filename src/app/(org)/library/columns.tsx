"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Lock as LockIcon } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { FavoriteButton } from "./favorite-button";

export type LibraryRow = {
  id: string;
  number: string;
  title: string;
  category: string;
  status: string;
  isFavorite: boolean;
  isLocked?: boolean;
};

// Department working-view columns: favorite star first, then the canonical
// identity cell (number mono + title medium), Category facet, Status badge.
export const columns: ColumnDef<LibraryRow>[] = [
  {
    id: "favorite",
    header: "",
    enableSorting: false,
    cell: ({ row }) => <FavoriteButton id={row.original.id} isFavorite={row.original.isFavorite} />,
  },
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
    accessorKey: "category",
    header: "Category",
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge value={row.original.status} kind="document" dot />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
];
