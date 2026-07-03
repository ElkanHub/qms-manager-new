import { redirect } from "next/navigation";
import { requirePlatformUser, getPlatformIdentity } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { FlowBuilder } from "./flow-builder";
import type { Audience, OnbStep } from "@/lib/onboarding-defaults";

// S-ONBOARDING — configure, per tenant, the two onboarding flows: ORGANIZATION
// SETUP (the first member in — sets up the environment) and EVERY MEMBER.
// Locked defaults are code and cannot be edited or removed; custom steps are
// built visually here and append after them. Preview runs the real wizard.
export default async function OnboardingConfig() {
  await requirePlatformUser();
  const { isOwner, scopes } = await getPlatformIdentity();
  if (!isOwner && !scopes.includes("switchboard")) redirect("/platform");

  const admin = createAdminClient();
  const { data: tenants } = await admin.from("tenants").select("id, name").order("name");
  const { data: flows } = await admin.from("onboarding_flows").select("tenant_id, audience, steps");
  const customOf = (id: string, audience: Audience): OnbStep[] => {
    const s = flows?.find((f) => f.tenant_id === id && f.audience === audience)?.steps;
    return Array.isArray(s) ? (s as OnbStep[]) : [];
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        title="Onboarding flows"
        description="Two flows per tenant: organization setup runs once (the first member in), every member runs the other. The greyed steps are the app's own — they set up the profile, the org environment, branding, and the signature, and cannot be changed. Your custom steps come after."
      />

      <div className="space-y-6">
        {(tenants ?? []).map((t) => (
          <SectionCard key={t.id} title={t.name}>
            <FlowBuilder
              tenantId={t.id}
              tenantName={t.name}
              initial={{
                org_setup: customOf(t.id, "org_setup"),
                member: customOf(t.id, "member"),
              }}
            />
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
