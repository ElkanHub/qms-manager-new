"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; message?: string } | { ok: false; error: string };

export async function assignTraining(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_training", {
    p_document: String(formData.get("document_id")),
    p_user: String(formData.get("user_id")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/training");
  return { ok: true, message: "Training assigned." };
}

export async function completeTraining(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_training", {
    p_assignment: String(formData.get("assignment_id")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/training");
  return { ok: true };
}

export async function issueCopy(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_controlled_copy", {
    p_version: String(formData.get("version_id")),
    p_holder: String(formData.get("holder")),
    p_purpose: String(formData.get("purpose") || "") || null,
    p_type: String(formData.get("copy_type") || "controlled"),
    p_format: String(formData.get("format") || "paper"),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/copies");
  return { ok: true, message: "Copy issued." };
}

export async function requestCopy(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_copy", {
    p_document: String(formData.get("document_id")),
    p_type: String(formData.get("copy_type")),
    p_format: String(formData.get("format")),
    p_destination: String(formData.get("destination")),
    p_quantity: Number(formData.get("quantity") || 1),
    p_purpose: String(formData.get("purpose")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/copies");
  return { ok: true, message: "Request sent to QA." };
}

export async function issueCopyRequest(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_copy_request", {
    p_request: String(formData.get("request_id")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/copies");
  return { ok: true, message: "Copies issued and on the register." };
}

export async function declineCopyRequest(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_copy_request", {
    p_request: String(formData.get("request_id")),
    p_reason: String(formData.get("reason") || ""),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/copies");
  return { ok: true, message: "Request declined." };
}

export async function reconcileCopy(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reconcile_copy", {
    p_copy: String(formData.get("copy_id")),
    p_method: String(formData.get("method") || "returned"),
    p_note: String(formData.get("note") || "") || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/copies");
  return { ok: true };
}

export async function concludeReview(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const outcome = String(formData.get("outcome"));
  const { data, error } = await supabase.rpc("conclude_periodic_review", {
    p_document: String(formData.get("document_id")),
    p_outcome: outcome,
    p_reason: String(formData.get("reason") || ""),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/periodic");
  revalidatePath("/", "layout"); // sidebar badges
  return {
    ok: true,
    message: outcome === "revise" ? `Change control raised (${data}).` : "Next review rescheduled.",
  };
}
