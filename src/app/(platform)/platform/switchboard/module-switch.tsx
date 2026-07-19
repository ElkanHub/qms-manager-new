"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
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
// under the old setting — only new flows see the change). Once off, a secondary
// control decides whether the item still shows on the org's sidebar as a greyed
// upsell (default) or is hidden entirely — visibility is stored in the module's
// config (`config.hidden`), so no schema change and it survives enable/disable.
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
  const baseConfig = config && typeof config === "object" ? (config as Record<string, unknown>) : {};
  const [on, setOn] = useState(enabled);
  const [hidden, setHidden] = useState(baseConfig.hidden === true);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  // One write path for both switches: persist the desired on/off + visibility,
  // merging into the existing config so a module's own settings are preserved.
  function save(nextOn: boolean, nextHidden: boolean, message: string) {
    const fd = new FormData();
    fd.set("tenant_id", tenantId);
    fd.set("module_key", moduleKey);
    if (nextOn) fd.set("enabled", "on"); // action reads enabled === "on"
    fd.set("config", JSON.stringify({ ...baseConfig, hidden: nextHidden }));
    startTransition(async () => {
      const result = await setModule(fd);
      if (result.ok) {
        setOn(nextOn);
        setHidden(nextHidden);
        toast.success(message);
      } else {
        toast.error(result.error);
      }
      setConfirming(false);
    });
  }

  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex items-center justify-between gap-4">
        <span className="font-medium">{label}</span>
        <Switch
          checked={on}
          disabled={pending}
          aria-label={`Toggle ${label}`}
          onCheckedChange={(next) =>
            next ? save(true, hidden, `${label} enabled.`) : setConfirming(true)
          }
        />
      </div>

      {/* Secondary control — only meaningful while the module is off. */}
      {!on && (
        <div className="flex items-center justify-between gap-4 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {hidden ? "Hidden from the sidebar" : "Shown as a greyed upsell"}
          </span>
          <Switch
            checked={!hidden}
            disabled={pending}
            aria-label={`Show ${label} on the sidebar`}
            onCheckedChange={(show) =>
              save(false, !show, `${label} ${show ? "shown as an upsell" : "hidden from the sidebar"}.`)
            }
          />
        </div>
      )}

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
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => save(false, hidden, `${label} disabled.`)}
            >
              Disable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
