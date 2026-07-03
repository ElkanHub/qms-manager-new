"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// Org-plane actions. Each calls a SECURITY DEFINER RPC that enforces authority
// (QA vs Org-Admin, the quality-critical boundary) server-side (rule 0.3). The
// UI reflects the boundary; these calls run as the authenticated user.
type Result = { ok: true; message?: string } | { ok: false; error: string };

export async function createDepartment(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_department", { p_name: String(formData.get("name")) });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/departments");
  return { ok: true };
}

export async function assignHod(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_hod", {
    p_target_user: String(formData.get("user_id")),
    p_department: String(formData.get("department_id")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/departments");
  return { ok: true };
}

export async function grantRole(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const dept = formData.get("department_id");
  const { error } = await supabase.rpc("grant_role", {
    p_target_user: String(formData.get("user_id")),
    p_role: String(formData.get("role")),
    p_department: dept ? String(dept) : null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/users");
  return { ok: true };
}

export async function deactivateUser(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("org_deactivate_user", {
    p_target_user: String(formData.get("user_id")),
    p_reason: String(formData.get("reason")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/users");
  return { ok: true };
}

// Org files a request-a-change against the switchboard (read-only for the org;
// the platform holds the switch). QA/Org-Admin only, enforced server-side.
export async function requestModuleChange(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_module_change", {
    p_module: String(formData.get("module_key")),
    p_desired_enabled: formData.get("desired_enabled") === "enable",
    p_note: String(formData.get("note") || ""),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/modules");
  return { ok: true, message: "Request sent to the platform." };
}

// QA defines the company's SOP-number format (metadata over the system id, A.3).
// QA-owned; server enforces is_qa. Format is validated JSON.
export async function setNumberingFormat(formData: FormData): Promise<Result> {
  let format: unknown;
  try {
    format = JSON.parse(String(formData.get("format") || "{}"));
  } catch {
    return { ok: false, error: "Format must be valid JSON." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_numbering_format", { p_format: format });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/numbering");
  return { ok: true, message: "Numbering format saved." };
}

// QA decides a platform break-glass request (consent mode). QA-of-tenant only,
// enforced server-side. reason is required and audited.
export async function decideAccess(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_access_request", {
    p_request: String(formData.get("request_id")),
    p_approve: formData.get("decision") === "approve",
    p_reason: String(formData.get("reason")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/access-grants");
  return { ok: true };
}

// Returns the invite link for the QA/Org-Admin to share (email delivery is a later
// concern — the foundation mints the one-time bound invitation).
export async function inviteUser(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const dept = formData.get("department_id");
  const { data, error } = await supabase.rpc("org_invite_user", {
    p_email: String(formData.get("email")),
    p_role: String(formData.get("role")),
    p_department: dept ? String(dept) : null,
  });
  if (error) return { ok: false, error: error.message };
  const token = data?.[0]?.token;
  return { ok: true, message: `${env.siteUrl()}/invite/accept?token=${token}` };
}

export async function setDepartmentCode(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_department_code", {
    p_department: String(formData.get("department_id")),
    p_code: String(formData.get("code") || ""),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/departments");
  return { ok: true, message: "Department code saved." };
}

export async function setRetentionPeriod(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_retention_period", {
    p_months: Number(formData.get("months") || 0),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/modules");
  return { ok: true, message: "Retention period saved." };
}
