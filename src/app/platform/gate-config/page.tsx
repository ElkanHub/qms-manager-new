import { redirect } from "next/navigation";
import { requirePlatformUser, getPlatformIdentity } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ActionForm } from "@/app/_components/ActionForm";
import { setGateMode } from "../actions";

// S-GATE-CONFIG — per-tenant gate-mode setting (default org-approved). The tenant's
// QA can also set their own posture from the org side; this is the platform view.
export default async function GateConfig() {
  await requirePlatformUser();
  if (!(await getPlatformIdentity()).isOwner) redirect("/platform");
  const admin = createAdminClient();
  const { data: tenants } = await admin.from("tenants").select("id, name").order("name");
  const { data: configs } = await admin.from("tenant_gate_config").select("tenant_id, mode");
  const modeOf = (id: string) => configs?.find((c) => c.tenant_id === id)?.mode ?? "org_approved";

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Break-glass gate mode</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Consent (org-approved) blocks access until the tenant&apos;s QA grants it.
        Self-authorized opens on request and notifies. Default is consent.
      </p>
      <div className="mt-6 space-y-4">
        {(tenants ?? []).map((t) => (
          <div key={t.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">{t.name}</span>
              <span className="text-xs uppercase text-neutral-500">{modeOf(t.id)}</span>
            </div>
            <ActionForm action={setGateMode} submitLabel="Save mode">
              <input type="hidden" name="tenant_id" value={t.id} />
              <select name="mode" defaultValue={modeOf(t.id)}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
                <option value="org_approved">org-approved (consent)</option>
                <option value="self_authorized">self-authorized (notification)</option>
              </select>
            </ActionForm>
          </div>
        ))}
      </div>
    </main>
  );
}
