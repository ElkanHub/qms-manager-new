"use client";

import * as React from "react";
import type { Table } from "@tanstack/react-table";
import { Check, ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type FacetConfig = {
  /** Column id to filter. */
  columnId: string;
  title: string;
  /** Optional label overrides for raw values. */
  options?: { value: string; label: string }[];
};

// Toolbar for DataTable (UI_BUILD_PLAN §6.2): debounced search + faceted filter
// dropdowns + column-visibility menu + right-aligned primary action slot.
export function DataTableToolbar<TData>({
  table,
  searchKey,
  searchPlaceholder = "Search…",
  facets,
  action,
}: {
  table: Table<TData>;
  searchKey?: string;
  searchPlaceholder?: string;
  facets?: FacetConfig[];
  action?: React.ReactNode;
}) {
  const searchCol = searchKey ? table.getColumn(searchKey) : undefined;
  const [term, setTerm] = React.useState((searchCol?.getFilterValue() as string) ?? "");

  // Debounce the search input into the column filter.
  React.useEffect(() => {
    if (!searchCol) return;
    const t = setTimeout(() => searchCol.setFilterValue(term || undefined), 200);
    return () => clearTimeout(t);
  }, [term, searchCol]);

  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {searchCol && (
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 w-full max-w-xs"
        />
      )}

      {facets?.map((f) => (
        <FacetFilter key={f.columnId} table={table} facet={f} />
      ))}

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => table.resetColumnFilters()}
          className="h-9"
        >
          Reset <X className="size-4" />
        </Button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <ColumnToggle table={table} />
        {action}
      </div>
    </div>
  );
}

function FacetFilter<TData>({
  table,
  facet,
}: {
  table: Table<TData>;
  facet: FacetConfig;
}) {
  const col = table.getColumn(facet.columnId);
  if (!col) return null;
  const selected = new Set((col.getFilterValue() as string[]) ?? []);
  const values = Array.from(col.getFacetedUniqueValues().keys())
    .filter((v): v is string => typeof v === "string")
    .sort();
  const labelFor = (v: string) => facet.options?.find((o) => o.value === v)?.label ?? v;

  function toggle(v: string) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    col!.setFilterValue(next.size ? Array.from(next) : undefined);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 border-dashed">
          {facet.title}
          {selected.size > 0 && (
            <span className="ml-1 rounded bg-secondary px-1.5 text-xs tabular-nums">
              {selected.size}
            </span>
          )}
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>{facet.title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {values.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">No values</div>
        )}
        {values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => toggle(v)}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
          >
            <span
              className={
                "flex size-4 items-center justify-center rounded border " +
                (selected.has(v) ? "bg-primary text-primary-foreground" : "opacity-50")
              }
            >
              {selected.has(v) && <Check className="size-3" />}
            </span>
            {labelFor(v)}
          </button>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ColumnToggle<TData>({ table }: { table: Table<TData> }) {
  const columns = table.getAllColumns().filter((c) => c.getCanHide());
  if (columns.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          Columns <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {columns.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.id}
            className="capitalize"
            checked={c.getIsVisible()}
            onCheckedChange={(v) => c.toggleVisibility(!!v)}
          >
            {c.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
