"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Result = { ok: true; message?: string } | { ok: false; error: string };
type Action = (formData: FormData) => Promise<Result>;

// The only type-to-confirm dialog (UI_BUILD_PLAN §6.3), used solely by Destroy.
// Requires the exact document number typed back AND a reason. Shows the retention
// math so the operator sees the elapsed hold before acting.
export function ConfirmDestructiveDialog({
  trigger,
  title = "Destroy record",
  confirmValue,
  retentionNote,
  action,
  submitLabel = "Destroy permanently",
  hiddenFields,
  extraFields,
}: {
  trigger: React.ReactNode;
  title?: string;
  /** The exact string the operator must type back (e.g. the document number). */
  confirmValue: string;
  /** e.g. "Retention elapsed 2031-04-01 · 4 years ago". */
  retentionNote?: string;
  action: Action;
  submitLabel?: string;
  hiddenFields?: Record<string, string>;
  /** Extra visible inputs (e.g. destruction method), submitted under their name. */
  extraFields?: { name: string; label: string; placeholder?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ready = typed === confirmValue && reason.trim().length >= 10;

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await action(formData);
      if (result.ok) {
        toast.success(result.message ?? "Destroyed.");
        setOpen(false);
        setTyped("");
        setReason("");
        setError(null);
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <form action={onSubmit} className="space-y-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. It is recorded permanently on the audit trail,
              attributed to you.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {retentionNote && (
            <Alert>
              <AlertDescription>{retentionNote}</AlertDescription>
            </Alert>
          )}

          {hiddenFields &&
            Object.entries(hiddenFields).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}

          {extraFields?.map((f) => (
            <div key={f.name} className="space-y-2">
              <Label htmlFor={`extra-${f.name}`}>{f.label}</Label>
              <Input id={`extra-${f.name}`} name={f.name} placeholder={f.placeholder} />
            </div>
          ))}

          <div className="space-y-2">
            <Label htmlFor="confirm-type">
              Type <span className="font-mono font-medium">{confirmValue}</span> to confirm
            </Label>
            <Input
              id="confirm-type"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              minLength={10}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={!ready || pending}>
              {pending && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
