"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth";
import { env } from "@/lib/env";

type Result = { ok: true; message?: string } | { ok: false; error: string };

// One-time platform-owner bootstrap: when the configured PLATFORM_OWNER_EMAIL
// identity first signs in and no owner exists, bind them as the platform root.
// This is the only account not created by invitation.
export async function bootstrapOwnerIfEligible(): Promise<boolean> {
  const authUser = await getAuthUser();
  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL?.toLowerCase();
  if (!authUser?.email || !ownerEmail || authUser.email.toLowerCase() !== ownerEmail) return false;
  const admin = createAdminClient();
  const { error } = await admin.rpc("bootstrap_platform_owner", {
    p_user_id: authUser.id,
    p_email: authUser.email,
  });
  return !error; // errors if an owner already exists — benign
}

export async function provisionTenant(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_provision_tenant", {
    p_tenant_name: String(formData.get("tenant_name")),
    p_org_name: String(formData.get("org_name")),
    p_qa_email: String(formData.get("qa_email")),
  });
  if (error) return { ok: false, error: error.message };
  const token = data?.[0]?.qa_invite_token;
  revalidatePath("/platform");
  return { ok: true, message: `Tenant created. Initial-QA invite: ${env.siteUrl()}/invite/accept?token=${token}` };
}

export async function inviteAdmin(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const scopes = formData.getAll("scopes").map(String);
  const { data, error } = await supabase.rpc("platform_invite_admin", {
    p_email: String(formData.get("email")),
    p_scopes: scopes,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: `Admin invite: ${env.siteUrl()}/invite/accept?token=${data?.[0]?.token}` };
}

export async function setGateMode(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_gate_mode", {
    p_tenant: String(formData.get("tenant_id")),
    p_mode: String(formData.get("mode")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/platform/gate-config");
  return { ok: true };
}

export async function requestAccess(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_tenant_access", {
    p_tenant: String(formData.get("tenant_id")),
    p_purpose: String(formData.get("purpose")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/platform/access");
  return { ok: true, message: "Access requested." };
}

export async function closeAccess(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_access_request", {
    p_request: String(formData.get("request_id")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/platform/access");
  return { ok: true };
}

// Configure a tenant's onboarding flow (the pages/fields a user runs after
// accepting their invite). Steps are stored as data; validated array server-side.
export async function setOnboardingFlow(formData: FormData): Promise<Result> {
  let steps: unknown;
  try {
    steps = JSON.parse(String(formData.get("steps") || "[]"));
  } catch {
    return { ok: false, error: "Steps must be valid JSON." };
  }
  if (!Array.isArray(steps)) return { ok: false, error: "Steps must be a JSON array." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_onboarding_flow", {
    p_tenant: String(formData.get("tenant_id")),
    p_steps: steps,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/platform/onboarding");
  return { ok: true, message: "Onboarding flow saved." };
}

// Re-run the hash-chain integrity check. The page re-fetches on revalidate and
// shows the fresh per-chain result; this action only surfaces RPC failures.
export async function verifyAuditChains(): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_audit_chains");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/platform/verify");
  const broken = (data ?? []).filter((c: { ok: boolean }) => !c.ok).length;
  return { ok: true, message: broken ? `${broken} chain break(s) detected.` : "All chains verified." };
}

export async function setModule(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_module", {
    p_tenant: String(formData.get("tenant_id")),
    p_module: String(formData.get("module_key")),
    p_enabled: formData.get("enabled") === "on",
    p_config: JSON.parse(String(formData.get("config") || "{}")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/platform/switchboard");
  return { ok: true };
}

export async function setAiGatewayConfig(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_ai_gateway_config", {
    p_provider: String(formData.get("provider") || "gemini"),
    p_model: String(formData.get("model") || "gemini-2.5-flash"),
    p_settings: {},
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/platform/ai-gateway");
  return { ok: true, message: "Gateway configuration saved." };
}
