"use client";

import { useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setStorageLimit } from "./actions";

export type TenantRow = {
  id: string;
  name: string;
  status: string;
  created: string;
  storageUsedBytes: number;
  storageLimitBytes: number;
};

const gb = (bytes: number) => (bytes / 1024 / 1024 / 1024).toFixed(2);

// Per-tenant storage: usage vs the platform-set cap, editable inline (audited
// on the tenant's own chain via set_tenant_storage_limit).
function StorageCell({ r }: { r: TenantRow }) {
  const [value, setValue] = useState(gb(r.storageLimitBytes));
  const [pending, startTransition] = useTransition();
  const dirty = value !== gb(r.storageLimitBytes);
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <span className="tabular-nums text-muted-foreground">{gb(r.storageUsedBytes)} /</span>
      <Input
        type="number"
        min={0.1}
        step={0.5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-20"
        aria-label="Storage limit (GB)"
      />
      <span className="text-xs text-muted-foreground">GB</span>
      {dirty && (
        <Button
          size="icon"
          variant="ghost"
          disabled={pending}
          aria-label="Save storage limit"
          onClick={() =>
            startTransition(async () => {
              const fd = new FormData();
              fd.set("tenant_id", r.id);
              fd.set("gb", value);
              const res = await setStorageLimit(fd);
              if (res.ok) toast.success(res.message ?? "Saved.");
              else toast.error(res.error);
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        </Button>
      )}
    </span>
  );
}

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
    id: "storage",
    header: "Storage (used / limit)",
    cell: ({ row }) => <StorageCell r={row.original} />,
  },
  {
    accessorKey: "created",
    header: "Created",
    cell: ({ row }) => <span className="tabular-nums">{row.original.created}</span>,
  },
];
