"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignHod } from "../actions";

type UserOption = { id: string; label: string };

// Per-row HOD assignment. Picking a user fires assignHod (department scoped).
// ponytail: no "current HOD" prefill — HOD lives in user_roles, not on the
// department row; add a lookup only if the screen must show who holds it today.
export function HodSelect({
  departmentId,
  users,
}: {
  departmentId: string;
  users: UserOption[];
}) {
  const [pending, startTransition] = useTransition();

  function onChange(userId: string) {
    const fd = new FormData();
    fd.set("user_id", userId);
    fd.set("department_id", departmentId);
    startTransition(async () => {
      const res = await assignHod(fd);
      if (res.ok) toast.success("HOD assigned.");
      else toast.error(res.error);
    });
  }

  return (
    <Select onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="w-56">
        {pending && <Loader2 className="animate-spin" />}
        <SelectValue placeholder="Assign HOD…" />
      </SelectTrigger>
      <SelectContent>
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
