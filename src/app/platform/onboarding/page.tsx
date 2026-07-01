import { redirect } from "next/navigation";
import { requirePlatformUser, getPlatformIdentity } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ActionForm } from "@/app/_components/ActionForm";
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
  const stepsOf = (id: string) =>
    JSON.stringify(flows?.find((f) => f.tenant_id === id)?.steps ?? [], null, 2);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Onboarding flows</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Define the steps and fields each tenant&apos;s users complete right after they
        accept their invitation. Field types: <code>text, textarea, select, checkbox,
        date, number</code>. A field with <code>&quot;required&quot;: true</code> must be filled.
      </p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-neutral-500">Example</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-neutral-900 p-3 text-xs text-neutral-100">{SAMPLE}</pre>
      </details>

      <div className="mt-6 space-y-8">
        {(tenants ?? []).map((t) => (
          <section key={t.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold">{t.name}</h2>
            <ActionForm action={setOnboardingFlow} submitLabel="Save flow">
              <input type="hidden" name="tenant_id" value={t.id} />
              <textarea name="steps" defaultValue={stepsOf(t.id)} rows={10}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-xs" />
            </ActionForm>
          </section>
        ))}
      </div>
    </main>
  );
}
