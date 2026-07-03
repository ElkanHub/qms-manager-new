"use server";

import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

// Collects every submitted field into an answers object and records it. Required
// fields are enforced server-side by submit_onboarding (and client-side by the form).
//
// Branding step (issue #20): when the flow collected the canonical branding_*
// fields, write them through set_tenant_branding (audited) so a newly onboarded
// tenant's certificates and training decks come out branded with zero follow-up.
// The RPC is QA/org-admin-only; for anyone else the write is skipped — the
// answers are still on the onboarding response, and /org/branding can apply
// them later. A branding failure never fails the onboarding itself.
export async function submitOnboarding(formData: FormData): Promise<Result> {
  const answers: Record<string, string> = {};
  for (const [k, v] of formData.entries()) answers[k] = String(v);

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_onboarding", { p_answers: answers });
  if (error) return { ok: false, error: error.message };

  const brandingKeys = Object.keys(answers).filter(
    (k) => k.startsWith("branding_") && answers[k].trim() !== "",
  );
  if (brandingKeys.length > 0) {
    await supabase.rpc("set_tenant_branding", {
      p_display_name: answers.branding_display_name?.trim() || null,
      p_logo_ref: answers.branding_logo_url?.trim() || null,
      p_color_primary: answers.branding_color_primary?.trim() || null,
      p_color_secondary: answers.branding_color_secondary?.trim() || null,
      p_color_accent: answers.branding_color_accent?.trim() || null,
    });
  }
  return { ok: true };
}
