"use client";

import { useMemo, useState, useTransition } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, MoreHorizontal, ShieldCheck } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/app/status-badge";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { setUserDepartment, setPrimaryRole, setCapability, deactivateUser } from "../actions";

export type Department = { id: string; name: string; isQuality: boolean };

export type UserRow = {
  id: string;
  name: string;
  email: string;
  initials: string;
  departmentId: string | null;
  department: string;
  /** Approval/release authority — conferred by QA-department membership. */
  isQa: boolean;
  primary: "hod" | "org_admin" | null;
  hodDepartment: string | null;
  capabilities: { signatory: boolean; trainer: boolean };
  status: string;
  departments: Department[];
  callerIsQA: boolean;
};

const PRIMARY_LABEL: Record<string, string> = {
  employee: "Employee",
  hod: "HOD / Manager",
  org_admin: "Org-Admin",
};

// Manage access — the three axes in one dialog: department (QA membership =
// approval authority), primary role (employee baseline / HOD / Org-Admin), and
// per-person capabilities (signatory, trainer). Choosing HOD or Org-Admin
// pre-fills the default capabilities; every toggle stays individually editable.
// The server enforces all boundaries; this dialog only reflects them.
function ManageAccessDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const initial = useMemo(
    () => ({
      department: user.departmentId ?? "",
      primary: user.primary ?? "employee",
      signatory: user.capabilities.signatory,
      trainer: user.capabilities.trainer,
    }),
    [user],
  );
  const [department, setDepartment] = useState(initial.department);
  const [primary, setPrimary] = useState<string>(initial.primary);
  const [signatory, setSignatory] = useState(initial.signatory);
  const [trainer, setTrainer] = useState(initial.trainer);
  const [pending, startTransition] = useTransition();

  const { callerIsQA } = user;
  // A move that touches the QA department (either side), or moves a current
  // QA-authority holder, is QA-only. Mirror the server rule in the select.
  const departmentLocked = !callerIsQA && user.isQa;
  const canPickDept = (d: Department) => callerIsQA || !d.isQuality;

  function onPrimaryChange(next: string) {
    setPrimary(next);
    // Role defaults pre-fill (HOD/Org-Admin are signatories + trainers by
    // default); each stays a per-person toggle below.
    if (next === "hod" || next === "org_admin") {
      setTrainer(true);
      if (callerIsQA) setSignatory(true);
    }
  }

  function onSave() {
    startTransition(async () => {
      const steps: { label: string; run: () => Promise<{ ok: boolean; error?: string }> }[] = [];
      if (department && department !== initial.department) {
        steps.push({ label: "department", run: () => setUserDepartment(user.id, department) });
      }
      if (primary !== initial.primary) {
        steps.push({
          label: "primary role",
          run: () =>
            setPrimaryRole(
              user.id,
              primary as "employee" | "hod" | "org_admin",
              primary === "hod" ? department || user.departmentId : null,
            ),
        });
      }
      if (signatory !== initial.signatory) {
        steps.push({ label: "signatory capability", run: () => setCapability(user.id, "signatory", signatory) });
      }
      if (trainer !== initial.trainer) {
        steps.push({ label: "trainer capability", run: () => setCapability(user.id, "trainer", trainer) });
      }
      if (steps.length === 0) {
        onOpenChange(false);
        return;
      }
      for (const step of steps) {
        const result = await step.run();
        if (!result.ok) {
          toast.error(`Could not change the ${step.label}: ${result.error}`);
          return;
        }
      }
      toast.success(`Access updated for ${user.name}.`);
      onOpenChange(false);
    });
  }

  const qaDept = user.departments.find((d) => d.isQuality);
  const joiningQA = !!qaDept && department === qaDept.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>Manage access</DialogTitle>
          <DialogDescription>
            {user.name} — department, primary role, and capabilities. Every change is audited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-left">
          <div className="space-y-2">
            <Label htmlFor="ma-department">Department</Label>
            <Select value={department} onValueChange={setDepartment} disabled={departmentLocked}>
              <SelectTrigger id="ma-department">
                <SelectValue placeholder="Select a department…" />
              </SelectTrigger>
              <SelectContent>
                {user.departments.map((d) => (
                  <SelectItem key={d.id} value={d.id} disabled={!canPickDept(d)}>
                    {d.name}
                    {d.isQuality ? " — confers approval authority" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {departmentLocked
                ? "This person holds QA authority — only QA can move them."
                : joiningQA
                  ? "QA membership confers approval/release authority. It is revoked automatically if they leave the department."
                  : callerIsQA
                    ? "Moving someone into or out of the QA department changes their approval authority."
                    : "The QA department is QA-managed — its membership confers approval authority."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ma-primary">Primary role</Label>
            <Select value={primary} onValueChange={onPrimaryChange}>
              <SelectTrigger id="ma-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee — the baseline (views and authors)</SelectItem>
                <SelectItem value="hod">HOD / Manager — departmental head</SelectItem>
                <SelectItem value="org_admin">Org-Admin — manages users and settings</SelectItem>
              </SelectContent>
            </Select>
            {primary === "hod" && (
              <p className="text-xs text-muted-foreground">
                They become HOD of {user.departments.find((d) => d.id === (department || user.departmentId))?.name ?? "their department"}.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Capabilities</Label>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5 pr-4">
                <p className="text-sm font-medium">Signatory</p>
                <p className="text-xs text-muted-foreground">
                  Can sign change packages. Default for HODs and Org-Admins; QA-only to change.
                </p>
              </div>
              <Switch
                checked={signatory}
                onCheckedChange={setSignatory}
                disabled={!callerIsQA}
                aria-label="Signatory capability"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5 pr-4">
                <p className="text-sm font-medium">Trainer</p>
                <p className="text-xs text-muted-foreground">
                  Can assign and release training. Default for HODs, Org-Admins, and QA.
                </p>
              </div>
              <Switch checked={trainer} onCheckedChange={setTrainer} aria-label="Trainer capability" />
            </div>
            <p className="text-xs text-muted-foreground">
              Capabilities never confer approval authority — that comes only from QA-department membership.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onSave} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UserActions({ user }: { user: UserRow }) {
  const [manageOpen, setManageOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  return (
    <div className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Row actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={(e) => (e.preventDefault(), setManageOpen(true))}>
            Manage access
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

      {manageOpen && (
        <ManageAccessDialog user={user} open={manageOpen} onOpenChange={setManageOpen} />
      )}

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
    cell: ({ row }) => (
      <span className="inline-flex items-center gap-1.5">
        {row.original.department}
        {row.original.isQa && (
          <Badge className="gap-1" title="Approval/release authority — QA-department membership">
            <ShieldCheck className="size-3" />
            QA
          </Badge>
        )}
      </span>
    ),
  },
  {
    id: "primary",
    header: "Primary role",
    accessorFn: (r) => PRIMARY_LABEL[r.primary ?? "employee"],
    cell: ({ row }) =>
      row.original.primary ? (
        <Badge variant="secondary">
          {PRIMARY_LABEL[row.original.primary]}
          {row.original.primary === "hod" && row.original.hodDepartment
            ? ` · ${row.original.hodDepartment}`
            : ""}
        </Badge>
      ) : (
        <span className="text-muted-foreground">Employee</span>
      ),
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    id: "capabilities",
    header: "Capabilities",
    cell: ({ row }) => {
      const caps = [
        row.original.capabilities.signatory && "Signatory",
        row.original.capabilities.trainer && "Trainer",
      ].filter(Boolean) as string[];
      return caps.length ? (
        <div className="flex flex-wrap gap-1">
          {caps.map((c) => (
            <Badge key={c} variant="outline">
              {c}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
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
