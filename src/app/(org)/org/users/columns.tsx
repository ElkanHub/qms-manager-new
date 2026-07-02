"use client";

import { useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/app/status-badge";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { grantRole, deactivateUser } from "../actions";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  initials: string;
  department: string;
  roles: string[];
  status: string;
  /** Roles this admin may grant (SoD boundary already applied server-side). */
  roleOptions: { key: string; label: string }[];
  isQA: boolean;
};

// Grant dialog + Deactivate reason dialog, driven from the row dropdown. Dialogs
// are rendered as siblings of the menu (controlled open state) so Radix portal
// focus doesn't fight the menu closing.
function UserActions({ user }: { user: UserRow }) {
  const [grantOpen, setGrantOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [role, setRole] = useState("");
  const [pending, startTransition] = useTransition();

  function onGrant(formData: FormData) {
    startTransition(async () => {
      const result = await grantRole(formData);
      if (result.ok) {
        toast.success(result.message ?? "Role granted.");
        setGrantOpen(false);
        setRole("");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Row actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={(e) => (e.preventDefault(), setGrantOpen(true))}>
            Grant/revoke role
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={user.status !== "active"}
            className="text-destructive"
            onSelect={(e) => (e.preventDefault(), setDeactivateOpen(true))}
          >
            Deactivate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent>
          <form action={onGrant} className="space-y-4 text-left">
            <DialogHeader>
              <DialogTitle>Grant role</DialogTitle>
              <DialogDescription>Grant a role to {user.name}.</DialogDescription>
            </DialogHeader>

            <input type="hidden" name="user_id" value={user.id} />
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={setRole} name="role" required>
                <SelectTrigger id="role">
                  <SelectValue placeholder="Select a role…" />
                </SelectTrigger>
                <SelectContent>
                  {user.roleOptions.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {user.isQA
                  ? "Quality-critical roles (QA, Approver, Signatory) carry a segregation-of-duties boundary — every grant is audited."
                  : "You may grant non–quality-critical roles. QA, Approver, and Signatory are QA-only — the segregation-of-duties boundary the server enforces."}
              </p>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={!role || pending}>
                {pending && <Loader2 className="animate-spin" />}
                Grant
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        action={deactivateUser}
        title="Deactivate user"
        description={`Deactivate ${user.name}. Their access is revoked immediately.`}
        submitLabel="Deactivate"
        destructive
        hiddenFields={{ user_id: user.id }}
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
      />
    </div>
  );
}

// ponytail: "revoke" is label-only — actions.ts exports grantRole/deactivateUser
// only. Wire a revoke action if per-role removal is needed.
export const columns: ColumnDef<UserRow>[] = [
  {
    id: "user",
    accessorFn: (r) => `${r.name} ${r.email}`,
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <Avatar className="size-8">
          <AvatarFallback className="text-xs">{row.original.initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">{row.original.email}</span>
        </div>
      </div>
    ),
  },
  {
    accessorKey: "department",
    header: "Department",
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    id: "roles",
    header: "Roles",
    cell: ({ row }) =>
      row.original.roles.length ? (
        <div className="flex flex-wrap gap-1">
          {row.original.roles.map((r) => (
            <Badge key={r} variant="secondary">
              {r}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge value={row.original.status} dot />,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <UserActions user={row.original} />,
  },
];
