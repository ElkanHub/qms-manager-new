"use server";

import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

// Collects every submitted field into an answers object and records it. Required
// fields are enforced server-side by submit_onboarding (and client-side by the form).
export async function submitOnboarding(formData: FormData): Promise<Result> {
  const answers: Record<string, string> = {};
  for (const [k, v] of formData.entries()) answers[k] = String(v);

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_onboarding", { p_answers: answers });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
