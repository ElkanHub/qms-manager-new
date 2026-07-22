"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckDraw } from "@/components/app/check-draw";
import { pingBadges } from "@/lib/badge-refresh";

type Result = { ok: true; message?: string } | { ok: false; error: string };
type Action = (formData: FormData) => Promise<Result>;

// Thin form wrapper that runs a server action and surfaces its ok/error/message.
// One component reused by every org/platform form so error handling is consistent.
// Errors: inline destructive Alert + toast. Success: toast (+ inline confirmation).
export function ActionForm({
  action,
  submitLabel,
  children,
}: {
  action: Action;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<Result | null, FormData>(
    async (_prev, formData) => action(formData),
    null,
  );

  // Toast on each settled result (ref guards against re-firing on re-render).
  const lastToasted = useRef<Result | null>(null);
  useEffect(() => {
    if (!state || state === lastToasted.current) return;
    lastToasted.current = state;
    if (state.ok) {
      toast.success(state.message ?? "Done.");
      pingBadges(); // a mutation likely moved a queue — refresh the sidebar counts now
    } else {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {children}
      <Button type="submit" disabled={pending} className="self-start">
        {pending && <Loader2 className="animate-spin" />}
        {submitLabel}
      </Button>
      {state && !state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      {state && state.ok && (
        <p className="flex items-center gap-1.5 break-all text-sm text-status-effective">
          <CheckDraw className="size-4 shrink-0" />
          {state.message ?? "Done."}
        </p>
      )}
    </form>
  );
}
