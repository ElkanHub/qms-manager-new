"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { setMatrix } from "../../changes/actions";

type Row = { class: string; roles: string[]; isDefault: boolean };

// Editable classification matrix: rows = risk class, columns = signatory roles,
// each cell a Checkbox for "this role must sign this class". Saved per row via
// setMatrix (FormData: class + comma-joined roles). "Default" badge marks rows
// still on the safe defaults (no persisted matrix row yet).
export function MatrixGrid({ roles, rows }: { roles: string[]; rows: Row[] }) {
  const [state, setState] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(rows.map((r) => [r.class, new Set(r.roles)]))
  );
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState<string | null>(null);

  function toggle(cls: string, role: string, on: boolean) {
    setState((prev) => {
      const next = new Set(prev[cls]);
      if (on) next.add(role);
      else next.delete(role);
      return { ...prev, [cls]: next };
    });
  }

  function save(cls: string) {
    const fd = new FormData();
    fd.set("class", cls);
    fd.set("roles", [...state[cls]].join(","));
    setSaving(cls);
    startTransition(async () => {
      const result = await setMatrix(fd);
      setSaving(null);
      if (result.ok) toast.success(result.message ?? `Saved ${cls} signatures.`);
      else toast.error(result.error);
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Class</TableHead>
          {roles.map((role) => (
            <TableHead key={role} className="text-center capitalize">
              {role}
            </TableHead>
          ))}
          <TableHead className="w-0" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.class}>
            <TableCell className="font-medium capitalize">
              <span className="flex items-center gap-2">
                {row.class}
                {row.isDefault && (
                  <Badge variant="outline" className="font-normal text-muted-foreground">
                    default
                  </Badge>
                )}
              </span>
            </TableCell>
            {roles.map((role) => (
              <TableCell key={role} className="text-center">
                <Checkbox
                  checked={state[row.class].has(role)}
                  onCheckedChange={(v) => toggle(row.class, role, v === true)}
                  aria-label={`${role} signs ${row.class}`}
                />
              </TableCell>
            ))}
            <TableCell>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => save(row.class)}
              >
                {saving === row.class && <Loader2 className="animate-spin" />}
                Save
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
