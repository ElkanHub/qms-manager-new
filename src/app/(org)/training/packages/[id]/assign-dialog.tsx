"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActionForm } from "@/app/_components/ActionForm";
import { assignPackage } from "../../actions";

// T-ASSIGN (plan §10): pick trainees, set the due date. Who assigned what,
// when, is on the audit spine per assignment.
export function AssignDialog({
  packageId,
  users,
  departments,
}: {
  packageId: string;
  users: { id: string; label: string }[];
  departments: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [department, setDepartment] = useState<string>("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus />
          Assign…
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign training</DialogTitle>
          <DialogDescription>
            Each assignment is audited: who assigned, to whom, when, due by. Untrained users are
            blocked from execution once this training is required.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={assignPackage} submitLabel="Assign">
          <input type="hidden" name="package_id" value={packageId} />
          {department && <input type="hidden" name="department_id" value={department} />}
          <div className="space-y-2">
            <Label>Whole department (optional — combines with individuals below)</Label>
            <Select value={department || "none"} onValueChange={(v) => setDepartment(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="No department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No department</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} — every active member
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ScrollArea className="h-48 rounded-md border p-3">
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-2">
                  <Checkbox id={`u-${u.id}`} name="user_ids" value={u.id} />
                  <Label htmlFor={`u-${u.id}`} className="text-sm font-normal">
                    {u.label}
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="space-y-2">
            <Label htmlFor="due_at">Due by (optional — tenant default applies)</Label>
            <Input id="due_at" name="due_at" type="date" />
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
