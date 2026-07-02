import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm, type Step } from "./OnboardingForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-8">
      <Card className="w-full">
        <CardHeader>
          <p className="text-sm text-muted-foreground">Welcome</p>
          <CardTitle className="text-2xl">Let&apos;s get you set up</CardTitle>
          <CardDescription>A few details from your organization before you start.</CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm steps={steps} />
        </CardContent>
      </Card>
    </main>
  );
}
