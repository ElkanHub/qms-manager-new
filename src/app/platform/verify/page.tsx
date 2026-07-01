import { requirePlatformUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// S-VERIFY — integrity check panel. Runs the hash-chain verification and shows each
// chain unbroken (or pinpoints a break). Lightweight status view, not a workflow.
export default async function Verify() {
  await requirePlatformUser();
  const supabase = await createClient();
  const { data: chains, error } = await supabase.rpc("verify_audit_chains");

  const allOk = (chains ?? []).every((c: { ok: boolean }) => c.ok);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Audit integrity</h1>
      {error ? (
        <p className="mt-4 text-sm text-red-600">{error.message}</p>
      ) : (
        <>
          <p className={`mt-2 text-sm font-medium ${allOk ? "text-green-700" : "text-red-600"}`}>
            {allOk ? "All chains verified — the audit trail is intact." : "A chain break was detected."}
          </p>
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="py-2">Chain</th><th>Entries</th><th>Status</th><th>Broken at</th>
              </tr>
            </thead>
            <tbody>
              {(chains ?? []).map((c: { chain: string; entries: number; ok: boolean; broken_at: number | null }) => (
                <tr key={c.chain} className="border-b border-neutral-100">
                  <td className="py-1.5 font-mono text-xs">{c.chain}</td>
                  <td>{c.entries}</td>
                  <td className={c.ok ? "text-green-700" : "text-red-600"}>{c.ok ? "intact" : "BROKEN"}</td>
                  <td>{c.broken_at ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
