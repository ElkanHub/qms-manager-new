"use server";

import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; message?: string } | { ok: false; error: string };

export async function flagFeedback(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("flag_feedback", {
    p_message: String(formData.get("message") || ""),
    p_context: String(formData.get("context") || "") || null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Flagged — thank you. It lands on the audit trail for QA." };
}
