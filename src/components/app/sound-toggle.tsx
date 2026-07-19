"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setSoundPref } from "@/app/(org)/pulse/actions";

// Notification sounds on/off — everyone controls their own.
export function SoundToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-between text-sm">
      <Label htmlFor="sound-pref" className="font-normal text-muted-foreground">
        Notification sounds
      </Label>
      <Switch
        id="sound-pref"
        checked={on}
        disabled={pending}
        onCheckedChange={(next) =>
          startTransition(async () => {
            const res = await setSoundPref(next);
            if (res.ok) setOn(next);
            else toast.error(res.error);
          })
        }
      />
    </div>
  );
}
