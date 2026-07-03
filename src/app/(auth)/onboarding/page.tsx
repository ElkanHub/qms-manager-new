import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingRunner } from "./onboarding-runner";
import type { OnbStep } from "@/lib/onboarding-defaults";

// The onboarding flow a user runs right after accepting their invitation. The
// SERVER decides the audience: the tenant's first completer runs the org-setup
// flow (profile, organization identity + branding, signature); everyone after
// runs the member flow (profile, signature). Locked defaults come from the
// engine; tenant custom steps append after them.
export default async function Onboarding() {
  const user = await requireUser();
  if (user.plane !== "org" || user.onboarded_at) redirect("/org");

  const supabase = await createClient();
  const [{ data: flow }, { data: sig }] = await Promise.all([
    supabase.rpc("my_onboarding"),
    supabase.rpc("my_signature_status"),
  ]);
  const audience = flow?.[0]?.audience as string | undefined;
  const steps = (flow?.[0]?.steps ?? []) as OnbStep[];
  if (steps.length === 0) redirect("/org");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader>
          <p className="text-sm text-muted-foreground">Welcome</p>
          <CardTitle className="text-2xl">
            {audience === "org_setup" ? "Let's set up your organization" : "Let's get you set up"}
          </CardTitle>
          <CardDescription>
            {audience === "org_setup"
              ? "You're the first one in — a few details set up the environment for everyone who follows."
              : "A few details from your organization before you start."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingRunner steps={steps} hasSignature={sig?.[0]?.has_signature ?? false} />
        </CardContent>
      </Card>
    </main>
  );
}
