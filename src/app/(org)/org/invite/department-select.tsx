"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Radix Select forbids an empty-string item value, but inviteUser treats a
// falsy department_id as org-wide. So we keep a sentinel in the Select and mirror
// the real value (blank for org-wide) into a hidden input for FormData.
const ORG_WIDE = "__org_wide";

export function DepartmentSelect({ departments }: { departments: { id: string; name: string }[] }) {
  const [value, setValue] = useState(ORG_WIDE);
  return (
    <>
      <input type="hidden" name="department_id" value={value === ORG_WIDE ? "" : value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ORG_WIDE}>Org-wide (no department)</SelectItem>
          {departments.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
