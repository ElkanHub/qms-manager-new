"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Change-pipe actions. Each calls a SECURITY DEFINER RPC that enforces authority,
// SoD, the impact hard gate, and completion server-side (rule 0.3); screens reflect.
type Result = { ok: true; message?: string } | { ok: false; error: string };

const rev = (id: string) => revalidatePath(`/changes/${id}`);

export async function createChange(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const targets = String(formData.get("targets") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const { data, error } = await supabase.rpc("create_change", {
    p_targets: targets,
    p_reason: String(formData.get("reason") || ""),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/changes");
  return { ok: true, message: `Change created: ${data}` };
}

export async function beginScreening(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const { error } = await supabase.rpc("begin_screening", { p_cc: id });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true };
}

export async function requestClarification(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const { error } = await supabase.rpc("request_cc_clarification", { p_cc: id, p_reason: String(formData.get("reason")) });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true };
}

export async function rejectChange(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const { error } = await supabase.rpc("reject_cc", { p_cc: id, p_reason: String(formData.get("reason")) });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true };
}

export async function submitImpact(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const impact = {
    documents_affected: String(formData.get("documents_affected") || ""),
    training_required: formData.get("training_required") === "on",
    templates_affected: formData.get("templates_affected") === "on",
    systems_touched: String(formData.get("systems_touched") || ""),
    revalidation_needed: formData.get("revalidation_needed") === "on",
    regulatory_notification: formData.get("regulatory_notification") === "on",
  };
  const { error } = await supabase.rpc("submit_impact", { p_cc: id, p_impact: impact });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true, message: "Impact assessment saved." };
}

export async function classifyChange(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const { error } = await supabase.rpc("classify_cc", {
    p_cc: id,
    p_class: String(formData.get("class")),
    p_reason: String(formData.get("reason") || "") || null,
  });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true };
}

export async function approveForWork(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const { data, error } = await supabase.rpc("approve_for_work", { p_cc: id });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true, message: data === "queued" ? "Queued — an affected document is locked under another change." : "Approved for work." };
}

export async function openDocumentWork(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const { error } = await supabase.rpc("open_document_work", { p_cc: id });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true };
}

export async function reviewDocument(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const { error } = await supabase.rpc("review_cc_document", { p_cc: id, p_document: String(formData.get("document_id")) });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true, message: "Reviewed." };
}

export async function applySignature(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const { error } = await supabase.rpc("apply_signature", { p_cc: id, p_meaning: String(formData.get("meaning")) });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true, message: "Signed." };
}

export async function waiveSignature(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const { error } = await supabase.rpc("waive_signature", {
    p_cc: id,
    p_role: String(formData.get("role")),
    p_reason: String(formData.get("reason")),
  });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true, message: "Waived." };
}

export async function reconcile(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const { data, error } = await supabase.rpc("reconcile_cc", {
    p_cc: id,
    p_force_reason: String(formData.get("force_reason") || "") || null,
  });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true, message: `Reconciled → ${data}` };
}

export async function releaseTraining(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const { error } = await supabase.rpc("release_cc_training", { p_cc: id });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true };
}

export async function enterEffectivenessReview(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const { error } = await supabase.rpc("enter_effectiveness_review", { p_cc: id });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true };
}

export async function closeChange(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = String(formData.get("cc"));
  const { error } = await supabase.rpc("close_cc", { p_cc: id, p_reason: String(formData.get("reason")) });
  if (error) return { ok: false, error: error.message };
  rev(id);
  return { ok: true, message: "Closed." };
}

export async function setMatrix(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const roles = String(formData.get("roles") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const { error } = await supabase.rpc("set_classification_matrix", { p_class: String(formData.get("class")), p_roles: roles });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/classify");
  return { ok: true };
}
