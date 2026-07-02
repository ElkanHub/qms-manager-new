import { redirect } from "next/navigation";
import { requirePlatformUser, getPlatformIdentity } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { GateModeForm } from "./gate-mode-form";

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
    <div className="mx-auto max-w-2xl space-y-6 p-2">
      <PageHeader
        title="Gate config"
        description="Break-glass gate mode per tenant. Consent (org-approved) blocks access until the tenant's QA grants it; self-authorized opens on request and notifies. Default is consent."
      />
      <div className="space-y-4">
        {(tenants ?? []).map((t) => (
          <SectionCard key={t.id} title={t.name}>
            <GateModeForm tenantId={t.id} mode={modeOf(t.id)} />
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
