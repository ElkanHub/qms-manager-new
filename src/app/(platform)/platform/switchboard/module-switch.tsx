"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setModule } from "../actions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Live, audited module toggle. Enabling applies immediately; disabling opens a
// confirm because engaged flows keep their in-flight snapshot (they finish
// under the old setting — only new flows see the change).
export function ModuleSwitch({
  tenantId,
  moduleKey,
  label,
  enabled,
  config,
}: {
  tenantId: string;
  moduleKey: string;
  label: string;
  enabled: boolean;
  config: unknown;
}) {
  const [on, setOn] = useState(enabled);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function apply(desired: boolean) {
    const fd = new FormData();
    fd.set("tenant_id", tenantId);
    fd.set("module_key", moduleKey);
    if (desired) fd.set("enabled", "on"); // action reads enabled === "on"
    fd.set("config", JSON.stringify(config ?? {}));
    startTransition(async () => {
      const result = await setModule(fd);
      if (result.ok) {
        setOn(desired);
        toast.success(`${label} ${desired ? "enabled" : "disabled"}.`);
      } else {
        toast.error(result.error);
      }
      setConfirming(false);
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
      <span className="font-medium">{label}</span>
      <Switch
        checked={on}
        disabled={pending}
        aria-label={`Toggle ${label}`}
        onCheckedChange={(next) => (next ? apply(true) : setConfirming(true))}
      />

      <Dialog open={confirming} onOpenChange={(o) => !pending && setConfirming(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable {label}?</DialogTitle>
            <DialogDescription>
              Running flows keep their snapshot — they finish under the current
              setting. Only flows that start after this change lose the module.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => apply(false)}>
              Disable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
