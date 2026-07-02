import { redirect } from "next/navigation";
import { requirePlatformUser, getPlatformIdentity } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ActionForm } from "@/app/_components/ActionForm";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { setOnboardingFlow } from "../actions";

const SAMPLE = JSON.stringify(
  [
    {
      key: "profile",
      title: "Your profile",
      fields: [
        { key: "phone", label: "Phone number", type: "text", required: true },
        { key: "shift", label: "Shift", type: "select", required: false, options: ["Day", "Night"] },
      ],
    },
  ],
  null,
  2,
);

type Step = { key?: string; title?: string; fields?: unknown[] };

// S-ONBOARDING — configure, per tenant, the flow a user goes through right after
// accepting their invitation: the pages (steps) and the data (fields) collected.
// The flow is stored as data and rendered natively — a visual builder is a later add.
export default async function OnboardingConfig() {
  await requirePlatformUser();
  const { isOwner, scopes } = await getPlatformIdentity();
  if (!isOwner && !scopes.includes("switchboard")) redirect("/platform");

  const admin = createAdminClient();
  const { data: tenants } = await admin.from("tenants").select("id, name").order("name");
  const { data: flows } = await admin.from("onboarding_flows").select("tenant_id, steps");
  const stepsOf = (id: string): Step[] => {
    const s = flows?.find((f) => f.tenant_id === id)?.steps;
    return Array.isArray(s) ? (s as Step[]) : [];
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Onboarding flows"
        description="Define the steps and fields each tenant's users complete right after they accept their invitation. Field types: text, textarea, select, checkbox, date, number. A field with &quot;required&quot;: true must be filled."
      />

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Example flow (JSON)</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">{SAMPLE}</pre>
      </details>

      <div className="space-y-6">
        {(tenants ?? []).map((t) => {
          const steps = stepsOf(t.id);
          return (
            <SectionCard
              key={t.id}
              title={t.name}
              description={steps.length ? undefined : "No onboarding steps configured yet."}
            >
              {steps.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {steps.map((step, i) => (
                    <Badge key={step.key ?? i} variant="secondary">
                      {step.title ?? step.key ?? `Step ${i + 1}`}
                      {Array.isArray(step.fields) && step.fields.length > 0 && (
                        <span className="ml-1 text-muted-foreground">· {step.fields.length}</span>
                      )}
                    </Badge>
                  ))}
                </div>
              )}
              <ActionForm action={setOnboardingFlow} submitLabel="Save flow">
                <input type="hidden" name="tenant_id" value={t.id} />
                <Textarea
                  name="steps"
                  defaultValue={JSON.stringify(steps, null, 2)}
                  rows={10}
                  className="font-mono text-xs"
                />
              </ActionForm>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
}
