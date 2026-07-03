"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setDepartmentCode } from "../actions";

// Inline editor for the department's short code — the tag the numbering format
// stamps into document numbers (e.g. the QA in SOP-QA-001).
export function CodeInput({ departmentId, code }: { departmentId: string; code: string | null }) {
  const [value, setValue] = useState(code ?? "");
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("department_id", departmentId);
      fd.set("code", value);
      const res = await setDepartmentCode(fd);
      if (res.ok) {
        setDirty(false);
        toast.success("Code saved.");
      } else toast.error(res.error);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={value}
        onChange={(e) => {
          setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8));
          setDirty(true);
        }}
        placeholder="auto"
        className="h-8 w-24 font-mono uppercase"
        aria-label="Department code"
      />
      {dirty && (
        <Button size="icon" variant="ghost" onClick={save} disabled={pending} aria-label="Save code">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        </Button>
      )}
    </div>
  );
}
