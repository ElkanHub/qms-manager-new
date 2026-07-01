import { redirect } from "next/navigation";
import { getAppUser, getAuthUser, mfaRequired } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { bootstrapOwnerIfEligible } from "@/app/platform/actions";

// Post-sign-in router. Runs the one-time owner bootstrap if eligible, then sends
// the user to their plane. An authenticated-but-unbound identity is a dead-end
// (no signup fallback, rule 0.5).
export default async function Start() {
  const authUser = await getAuthUser();
  if (!authUser) redirect("/signin");

  await bootstrapOwnerIfEligible(); // no-op unless configured owner + no owner yet

  const user = await getAppUser();
  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">No account bound</h1>
        <p className="text-sm text-neutral-600">
          This Google identity isn&apos;t linked to any organization. Access is by
          invitation only — ask your QA to invite you.
        </p>
      </main>
    );
  }
  if (await mfaRequired()) redirect("/mfa");

  // Onboarding gate: right after acceptance, an org user runs their tenant's
  // configured flow (if any, with at least one step) before reaching the app.
  if (user.plane === "org" && !user.onboarded_at) {
    const supabase = await createClient();
    const { data: flow } = await supabase
      .from("onboarding_flows")
      .select("steps")
      .eq("tenant_id", user.tenant_id)
      .maybeSingle();
    if (flow && Array.isArray(flow.steps) && flow.steps.length > 0) redirect("/onboarding");
  }

  redirect(user.plane === "platform" ? "/platform" : "/org");
}
