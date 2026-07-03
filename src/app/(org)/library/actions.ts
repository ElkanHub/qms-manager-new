"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Toggle a favorite (presentation convenience). Server enforces tenant via the RPC.
export async function toggleFavorite(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("toggle_favorite", { p_document: String(formData.get("document_id")) });
  revalidatePath("/library");
}

type Result = { ok: true; message?: string } | { ok: false; error: string };
const call = async (
  fn: string,
  args: Record<string, unknown>,
  paths: string[],
): Promise<Result> => {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  paths.forEach((p) => revalidatePath(p));
  return { ok: true };
};

export async function lockDocument(formData: FormData): Promise<Result> {
  return call("lock_document",
    { p_document: String(formData.get("document_id")), p_reason: String(formData.get("reason") || "") },
    ["/library", "/library/master", `/documents/${formData.get("document_id")}`]);
}
export async function unlockDocument(formData: FormData): Promise<Result> {
  return call("unlock_document",
    { p_document: String(formData.get("document_id")) },
    ["/library", "/library/master", "/library/config", `/documents/${formData.get("document_id")}`]);
}
export async function requestReadAccess(formData: FormData): Promise<Result> {
  const res = await call("request_read_access",
    { p_document: String(formData.get("document_id")), p_purpose: String(formData.get("purpose") || "") },
    [`/documents/${formData.get("document_id")}`]);
  return res.ok ? { ok: true, message: "Request sent to QA." } : res;
}
export async function grantReadAccess(formData: FormData): Promise<Result> {
  return call("grant_read_access",
    { p_request: String(formData.get("request_id")), p_hours: Number(formData.get("hours") || 0) },
    ["/library/config"]);
}
export async function declineReadAccess(formData: FormData): Promise<Result> {
  return call("decline_read_access",
    { p_request: String(formData.get("request_id")), p_reason: String(formData.get("reason") || "") },
    ["/library/config"]);
}
export async function revokeReadAccess(formData: FormData): Promise<Result> {
  return call("revoke_read_access",
    { p_request: String(formData.get("request_id")), p_reason: String(formData.get("reason") || "") },
    ["/library/config"]);
}
export async function upsertCategory(formData: FormData): Promise<Result> {
  const id = formData.get("category_id");
  return call("upsert_library_category",
    { p_name: String(formData.get("name") || ""), p_sort: Number(formData.get("sort") || 0),
      p_id: id ? String(id) : null },
    ["/library", "/library/config"]);
}
export async function deleteCategory(formData: FormData): Promise<Result> {
  return call("delete_library_category",
    { p_id: String(formData.get("category_id")) },
    ["/library", "/library/config"]);
}
export async function setDocumentCategories(formData: FormData): Promise<Result> {
  return call("set_document_categories",
    { p_document: String(formData.get("document_id")),
      p_category_ids: formData.getAll("category_ids").map(String) },
    ["/library", `/documents/${formData.get("document_id")}`]);
}
