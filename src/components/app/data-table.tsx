"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTableToolbar, type FacetConfig } from "@/components/app/data-table-toolbar";
import { Button } from "@/components/ui/button";

// The one table (UI_BUILD_PLAN §6.2). TanStack + shadcn Table with debounced
// search, faceted filters, column visibility, whole-row links and pagination.
// Row density py-2.5; the identity column and a StatusBadge column are supplied by
// the caller's column defs.
export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Column id to drive the search input. */
  searchKey?: string;
  searchPlaceholder?: string;
  /** Faceted filters (status, department, category…). */
  facets?: FacetConfig[];
  initialSort?: SortingState;
  /** Whole-row link; returns an href for a row or null for non-linking rows.
      CLIENT callers only — functions cannot cross the server→client boundary. */
  onRowHref?: (row: TData) => string | null;
  /** Whole-row link for SERVER callers (serializable): href = `${rowHrefBase}/${row.id}`. */
  rowHrefBase?: string;
  /** Rendered when there are no rows at all. */
  emptyState?: React.ReactNode;
  /** Right-aligned primary action in the toolbar. */
  toolbarAction?: React.ReactNode;
  pageSize?: number;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder,
  facets,
  initialSort = [],
  onRowHref,
  rowHrefBase,
  emptyState,
  toolbarAction,
  pageSize = 25,
}: DataTableProps<TData, TValue>) {
  const router = useRouter();
  const rowHref = React.useMemo(
    () =>
      onRowHref ??
      (rowHrefBase
        ? (row: TData) => {
            const id = (row as { id?: string }).id;
            return id ? `${rowHrefBase}/${id}` : null;
          }
        : undefined),
    [onRowHref, rowHrefBase],
  );
  const [sorting, setSorting] = React.useState<SortingState>(initialSort);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, columnVisibility },
    initialState: { pagination: { pageSize } },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const rows = table.getRowModel().rows;

  if (data.length === 0 && emptyState) {
    return (
      <div className="space-y-4">
        {(searchKey || facets || toolbarAction) && (
          <DataTableToolbar
            table={table}
            searchKey={searchKey}
            searchPlaceholder={searchPlaceholder}
            facets={facets}
            action={toolbarAction}
          />
        )}
        {emptyState}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar
        table={table}
        searchKey={searchKey}
        searchPlaceholder={searchPlaceholder}
        facets={facets}
        action={toolbarAction}
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
                {rowHref && <TableHead className="w-8" />}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => {
                const href = rowHref?.(row.original);
                return (
                  <TableRow
                    key={row.id}
                    className={href ? "cursor-pointer" : undefined}
                    onClick={href ? () => router.push(href) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-2.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                    {rowHref && (
                      <TableCell className="w-8 py-2.5">
                        {href && (
                          // The row's real anchor (§9): keyboard-focusable,
                          // middle-clickable, announced as a link. The row
                          // onClick is a pointer convenience on top of it.
                          <Link
                            href={href}
                            className="flex text-muted-foreground hover:text-foreground"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ChevronRight className="size-4" />
                            <span className="sr-only">Open</span>
                          </Link>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (rowHref ? 1 : 0)}
                  className="h-24 text-center text-muted-foreground"
                >
                  No results for the current filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="tabular-nums">
          {table.getFilteredRowModel().rows.length} row
          {table.getFilteredRowModel().rows.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <span className="tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
