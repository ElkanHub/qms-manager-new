"use client";

import { useActionState, useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { verifyAuditChains } from "../actions";

type Result = { ok: true; message?: string } | { ok: false; error: string };

// Small client button: re-runs the hash-chain check and lets the server page
// re-render with fresh per-chain state (revalidatePath). Pending disables + spins.
export function RunVerification() {
  const [state, run, pending] = useActionState<Result | null>(
    async () => verifyAuditChains(),
    null,
  );

  const last = useRef<Result | null>(null);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.ok) toast.success(state.message ?? "Done.");
    else toast.error(state.error);
  }, [state]);

  return (
    <form action={run}>
      <Button type="submit" disabled={pending}>
        <RefreshCw className={pending ? "animate-spin" : undefined} />
        {pending ? "Verifying…" : "Run verification"}
      </Button>
    </form>
  );
}
