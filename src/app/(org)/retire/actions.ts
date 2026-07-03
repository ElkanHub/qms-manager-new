"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true; message?: string } | { ok: false; error: string };

export async function requestRetirement(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_retirement", {
    p_document: String(formData.get("document_id")),
    p_justification: String(formData.get("justification")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/queues/retirements");
  revalidatePath("/", "layout"); // sidebar badges
  return { ok: true, message: "Retirement requested." };
}

export async function approveRetirement(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_retirement", { p_retirement: String(formData.get("retirement_id")) });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/queues/retirements");
  revalidatePath("/", "layout"); // sidebar badges
  return { ok: true };
}

export async function withdrawRetirement(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_retirement", { p_retirement: String(formData.get("retirement_id")) });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/queues/retirements");
  revalidatePath("/", "layout"); // sidebar badges
  return { ok: true };
}

export async function destroyVersion(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("destroy_version", {
    p_version: String(formData.get("version_id")),
    p_method: String(formData.get("method") || "secure-destruction"),
    p_reason: String(formData.get("reason")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/queues/destruction");
  revalidatePath("/", "layout"); // sidebar badges
  return { ok: true };
}
