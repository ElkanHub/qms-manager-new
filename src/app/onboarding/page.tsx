import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm, type Step } from "./OnboardingForm";

// The onboarding flow a user runs right after accepting their invitation. Steps and
// fields come entirely from the tenant's configured flow (set on the platform board).
export default async function Onboarding() {
  const user = await requireUser();
  if (user.plane !== "org" || user.onboarded_at) redirect("/org");

  const supabase = await createClient();
  const { data: flow } = await supabase
    .from("onboarding_flows")
    .select("steps")
    .eq("tenant_id", user.tenant_id)
    .maybeSingle();

  const steps = (flow?.steps ?? []) as Step[];
  if (steps.length === 0) redirect("/org"); // nothing configured → nothing to do

  return (
    <main className="mx-auto max-w-lg p-8">
      <p className="text-sm text-neutral-500">Welcome</p>
      <h1 className="text-2xl font-semibold">Let&apos;s get you set up</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-600">
        A few details from your organization before you start.
      </p>
      <OnboardingForm steps={steps} />
    </main>
  );
}
