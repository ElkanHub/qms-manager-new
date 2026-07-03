"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// New-SOP pipe actions. Each calls a SECURITY DEFINER RPC that enforces authority
// and SoD server-side (rule 0.3); the screens only reflect the guards.
type Result = { ok: true; message?: string } | { ok: false; error: string };

export async function updateDraft(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_draft", {
    p_document: String(formData.get("document_id")),
    p_title: String(formData.get("title") || "") || null,
    p_content_ref: String(formData.get("content_ref") || "") || null,
    p_reason: String(formData.get("reason") || "") || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/documents/${formData.get("document_id")}/draft`);
  return { ok: true };
}

export async function submitDocument(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_document", { p_document: String(formData.get("document_id")) });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/documents/${formData.get("document_id")}/draft`);
  revalidatePath("/", "layout"); // sidebar badges
  return { ok: true, message: "Submitted for review." };
}

export async function resubmitDocument(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("resubmit_document", { p_document: String(formData.get("document_id")) });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/documents/${formData.get("document_id")}/changes`);
  revalidatePath("/", "layout"); // sidebar badges
  return { ok: true, message: "Resubmitted." };
}

export async function requestChanges(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_changes", {
    p_request: String(formData.get("request_id")),
    p_reason: String(formData.get("reason")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/queues/endorse");
  revalidatePath("/queues/qa-review");
  revalidatePath("/", "layout"); // sidebar badges
  return { ok: true, message: "Changes requested." };
}

export async function endorse(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("endorse_request", { p_request: String(formData.get("request_id")) });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/queues/endorse");
  revalidatePath("/", "layout"); // sidebar badges
  return { ok: true, message: "Endorsed." };
}

export async function rejectRequest(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_request", {
    p_request: String(formData.get("request_id")),
    p_reason: String(formData.get("reason")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/queues/qa-review");
  revalidatePath("/", "layout"); // sidebar badges
  return { ok: true, message: "Rejected." };
}

export async function qaApprove(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const date = String(formData.get("effective_date") || "");
  const { error } = await supabase.rpc("qa_approve", {
    p_request: String(formData.get("request_id")),
    p_training_required: formData.get("training_required") === "on",
    p_effective_date: date || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/queues/qa-review");
  revalidatePath("/", "layout"); // sidebar badges
  return { ok: true, message: "Approved." };
}
