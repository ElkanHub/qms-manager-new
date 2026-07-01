import { requirePlatformUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ActionForm } from "@/app/_components/ActionForm";
import { requestAccess, closeAccess } from "../actions";

// S-ACCESS-GATE — where a platform admin requests bounded access to a tenant's data.
// Shows each tenant's configured mode. In consent mode the request waits for QA; in
// self-authorized mode it opens immediately. Everything done during an open session
// is captured on the tenant's audit trail.
export default async function AccessGate() {
  const me = await requirePlatformUser();
  const admin = createAdminClient();
  const { data: tenants } = await admin.from("tenants").select("id, name").order("name");
  const { data: configs } = await admin.from("tenant_gate_config").select("tenant_id, mode");
  const { data: myRequests } = await admin
    .from("access_requests")
    .select("id, tenant_id, purpose, status, mode, expires_at")
    .eq("requested_by", me.id)
    .order("requested_at", { ascending: false });
  const modeOf = (id: string) => configs?.find((c) => c.tenant_id === id)?.mode ?? "org_approved";
  const nameOf = (id: string) => tenants?.find((t) => t.id === id)?.name ?? id;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Break-glass access</h1>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Request access</h2>
        <ActionForm action={requestAccess} submitLabel="Request">
          <select name="tenant_id" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
            {(tenants ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name} — {modeOf(t.id) === "org_approved" ? "consent required" : "self-authorized"}</option>
            ))}
          </select>
          <input name="purpose" required placeholder="Purpose (required, audited)"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </ActionForm>
      </section>

      <h2 className="mt-8 text-sm font-semibold">Your requests</h2>
      <ul className="mt-2 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {(myRequests ?? []).map((r) => (
          <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>
              <span className="font-medium">{nameOf(r.tenant_id)}</span>
              <span className="ml-2 text-neutral-500">{r.purpose}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="text-xs uppercase text-neutral-500">{r.status}</span>
              {r.status === "open" && (
                <form action={async (fd) => { "use server"; await closeAccess(fd); }}>
                  <input type="hidden" name="request_id" value={r.id} />
                  <button className="text-xs underline">close</button>
                </form>
              )}
            </span>
          </li>
        ))}
        {!myRequests?.length && <li className="px-4 py-3 text-sm text-neutral-500">No requests yet.</li>}
      </ul>
    </main>
  );
}
