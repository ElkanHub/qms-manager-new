"use client";

import { useRouter } from "next/navigation";
import { OnboardingWizard } from "@/components/app/onboarding-wizard";
import type { OnbStep } from "@/lib/onboarding-defaults";
import { submitOnboarding } from "./actions";

// Thin client shell: the wizard collects, this submits and routes in.
export function OnboardingRunner({
  steps,
  hasSignature,
}: {
  steps: OnbStep[];
  hasSignature: boolean;
}) {
  const router = useRouter();
  return (
    <OnboardingWizard
      steps={steps}
      hasSignature={hasSignature}
      onSubmit={async (answers) => {
        const fd = new FormData();
        Object.entries(answers).forEach(([k, v]) => fd.set(k, v));
        const res = await submitOnboarding(fd);
        if (res.ok) {
          router.push("/org");
          return { ok: true };
        }
        return { ok: false, error: res.error };
      }}
    />
  );
}
