"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Result = { ok: true; message?: string } | { ok: false; error: string };
type Action = (formData: FormData) => Promise<Result>;

// Any discretionary action (reject, dispute, waive, override, force, retire…)
// opens this dialog and *requires* a reason before confirm enables
// (UI_BUILD_PLAN §1, §6.3). The reason lands on the audit trail, attributed.
export function ReasonDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "Confirm",
  reasonLabel = "Reason",
  reasonName = "reason",
  minLength = 10,
  destructive = false,
  hiddenFields,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: React.ReactNode;
  title: string;
  description?: string;
  action: Action;
  submitLabel?: string;
  reasonLabel?: string;
  reasonName?: string;
  minLength?: number;
  destructive?: boolean;
  /** Extra values submitted with the form (e.g. target id). */
  hiddenFields?: Record<string, string>;
  /** Extra fields rendered above the reason textarea. */
  children?: React.ReactNode;
  /** Controlled open state — for triggering from a dropdown item instead of `trigger`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setInternalOpen(o));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = reason.trim().length >= minLength;

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        toast.success(result.message ?? "Done.");
        setOpen(false);
        setReason("");
        setError(null);
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <form action={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          {hiddenFields &&
            Object.entries(hiddenFields).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          {children}

          <div className="space-y-2">
            <Label htmlFor={reasonName}>{reasonLabel}</Label>
            <Textarea
              id={reasonName}
              name={reasonName}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              required={minLength > 0}
              minLength={minLength}
            />
            <p className="text-xs text-muted-foreground">
              Recorded permanently on the audit trail, attributed to you.
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="submit"
              disabled={!ready || pending}
              variant={destructive ? "destructive" : "default"}
            >
              {pending && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
