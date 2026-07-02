import { redirect } from "next/navigation";
import { requirePlatformUser, getPlatformIdentity } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { EmptyState } from "@/components/app/empty-state";
import { ModuleSwitch } from "./module-switch";

// S-SWITCHBOARD — per-tenant module on/off. Platform-controlled, every change
// audited. In-flight policy: turning a module off applies only to flows that
// start after the switch; engaged flows continue under the old setting.
export default async function Switchboard() {
  await requirePlatformUser();
  const { isOwner, scopes } = await getPlatformIdentity();
  if (!isOwner && !scopes.includes("switchboard")) redirect("/platform");

  const admin = createAdminClient();
  const { data: tenants } = await admin.from("tenants").select("id, name").order("name");
  const { data: modules } = await admin.from("modules").select("*").order("label");
  const { data: state } = await admin
    .from("tenant_modules")
    .select("tenant_id, module_key, enabled, config");
  const cell = (tid: string, mk: string) =>
    state?.find((s) => s.tenant_id === tid && s.module_key === mk);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        title="Switchboard"
        description="A module off removes a capability — it never breaks a core flow (the core takes its safe default). Changes apply to new flows immediately; in-flight flows finish under the old setting."
      />

      {(tenants ?? []).length === 0 ? (
        <EmptyState message="No tenants provisioned yet — provision one to configure its modules." />
      ) : (
        (tenants ?? []).map((t) => (
          <SectionCard key={t.id} title={t.name} contentClassName="space-y-3">
            {(modules ?? []).map((m) => {
              const c = cell(t.id, m.key);
              return (
                <ModuleSwitch
                  key={m.key}
                  tenantId={t.id}
                  moduleKey={m.key}
                  label={m.label}
                  enabled={c?.enabled ?? false}
                  config={c?.config ?? {}}
                />
              );
            })}
          </SectionCard>
        ))
      )}
    </div>
  );
}
