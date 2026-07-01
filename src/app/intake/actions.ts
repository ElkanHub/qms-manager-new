"use server";

import { createClient } from "@/lib/supabase/server";

export type StartResult =
  | { ok: true; intakeId: string; inferredType: string; abandonedDraftId: string | null }
  | { ok: false; error: string };

// Capture + infer. Returns the inferred type (with which the UI shows the rationale)
// and any abandoned draft to fork on. Inference/route behavior is fixed (enforcement).
export async function startIntake(input: {
  reason: string;
  title: string;
  targets: string[];
  discontinue: boolean;
  contentRef: string;
}): Promise<StartResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_intake", {
    p_reason: input.reason,
    p_title: input.title || null,
    p_targets: input.targets,
    p_discontinue: input.discontinue,
    p_content_ref: input.contentRef || null,
  });
  if (error) return { ok: false, error: error.message };
  const row = data?.[0];
  return { ok: true, intakeId: row.intake_id, inferredType: row.inferred_type, abandonedDraftId: row.abandoned_draft_id };
}

export async function dispatchIntake(
  intakeId: string,
  resumeDocumentId: string | null,
): Promise<{ ok: true; documentId: string | null } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dispatch_intake", {
    p_intake: intakeId,
    p_resume_document_id: resumeDocumentId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, documentId: (data as string | null) ?? null };
}

export async function disputeIntake(
  intakeId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("dispute_intake", { p_intake: intakeId, p_reason: reason });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
