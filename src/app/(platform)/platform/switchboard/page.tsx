import { redirect } from "next/navigation";
import { requirePlatformUser, getPlatformIdentity } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
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
  const { data: modules } = await admin
    .from("modules")
    .select("*")
    .order("category")
    .order("sort_order");
  const { data: state } = await admin
    .from("tenant_modules")
    .select("tenant_id, module_key, enabled, config");
  const cell = (tid: string, mk: string) =>
    state?.find((s) => s.tenant_id === tid && s.module_key === mk);

  // The control center groups switches by service category; upcoming modules
  // are switchable today — their feature code consumes the switch when it lands.
  const CATEGORY_LABELS: Record<string, string> = {
    document_control: "Document control",
    ai: "AI services",
    quality: "Quality processes",
  };
  const CATEGORY_ORDER = ["document_control", "ai", "quality"];
  const byCategory = (cat: string) => (modules ?? []).filter((m) => m.category === cat);

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
          <SectionCard key={t.id} title={t.name} contentClassName="space-y-5">
            {CATEGORY_ORDER.map((cat) => {
              const mods = byCategory(cat);
              if (mods.length === 0) return null;
              return (
                <div key={cat} className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </h3>
                  {mods.map((m) => {
                    const c = cell(t.id, m.key);
                    return (
                      <div key={m.key} className="flex items-start gap-2">
                        <div className="flex-1">
                          <ModuleSwitch
                            tenantId={t.id}
                            moduleKey={m.key}
                            label={m.label}
                            enabled={c?.enabled ?? false}
                            config={c?.config ?? {}}
                          />
                        </div>
                        {m.upcoming && (
                          <Badge variant="outline" className="mt-1 shrink-0">
                            Coming soon
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </SectionCard>
        ))
      )}
    </div>
  );
}
