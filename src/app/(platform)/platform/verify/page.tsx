import { ShieldCheck, ShieldX } from "lucide-react";
import { requirePlatformUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RunVerification } from "./run-verification";

type Chain = { chain: string; entries: number; ok: boolean; broken_at: number | null };

// S-VERIFY — integrity check board. Runs the hash-chain verification and shows each
// chain unbroken (or pinpoints a break). Lightweight status view, not a workflow.
export default async function Verify() {
  await requirePlatformUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_audit_chains");
  const chains = (data ?? []) as Chain[];
  const verifiedAt = new Date(); // render-time; refreshed on each Run verification

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        title="Audit integrity"
        description="Per-chain hash verification of the append-only audit trail."
        actions={<RunVerification />}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {chains.map((c) => (
            <SectionCard
              key={c.chain}
              title={c.chain}
              actions={
                c.ok ? (
                  <ShieldCheck className="size-5 text-status-effective" />
                ) : (
                  <ShieldX className="size-5 text-destructive" />
                )
              }
            >
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className={c.ok ? "text-status-effective" : "text-destructive"}>
                    {c.ok ? "Intact" : "Broken"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Entries</dt>
                  <dd className="tabular-nums">{c.entries}</dd>
                </div>
                {!c.ok && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Broken at</dt>
                    <dd className="font-mono text-destructive">#{c.broken_at ?? "?"}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Last verified</dt>
                  <dd className="tabular-nums text-muted-foreground">
                    {verifiedAt.toLocaleString()}
                  </dd>
                </div>
              </dl>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
