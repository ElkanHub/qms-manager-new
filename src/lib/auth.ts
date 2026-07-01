import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppUser = {
  id: string;
  tenant_id: string | null;
  org_id: string | null;
  department_id: string | null;
  email: string;
  full_name: string | null;
  plane: "org" | "platform";
  initial_role: string | null;
  status: "active" | "deactivated";
  onboarded_at: string | null;
};

// The authenticated auth user (or null). Session freshness is kept by middleware.
export async function getAuthUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

// The bound app account for the current session. Null if signed in but unbound
// (no invitation consumed) — that user is a dead-end, never an implicit signup.
export async function getAppUser(): Promise<AppUser | null> {
  const authUser = await getAuthUser();
  if (!authUser) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("*").eq("id", authUser.id).maybeSingle();
  return (data as AppUser) ?? null;
}

// Mandatory MFA gate: true when the session must still satisfy a second factor.
export async function mfaRequired(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  // nextLevel aal2 while currentLevel below it => a challenge is owed.
  return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

// Guard for any protected screen: signed in + bound + MFA satisfied + active.
// Enforcement of *what* they can do is per-RPC server-side; this is the entry gate.
export async function requireUser(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) redirect("/signin");
  if (user.status === "deactivated") redirect("/signin?error=deactivated");
  if (await mfaRequired()) redirect("/mfa");
  return user;
}

// Org-plane entry gate.
export async function requireOrgUser(): Promise<AppUser> {
  const user = await requireUser();
  if (user.plane !== "org") redirect("/platform");
  return user;
}

// The current user's granted role keys (for reflecting the delegation boundary
// in the UI — the server still enforces it).
export async function getMyRoles(): Promise<string[]> {
  const user = await getAuthUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  return (data ?? []).map((r) => r.role as string);
}

// Platform-plane entry gate.
export async function requirePlatformUser(): Promise<AppUser> {
  const user = await requireUser();
  if (user.plane !== "platform") redirect("/org");
  return user;
}

// Platform membership: owner flag + granted scopes (UI reflection; server enforces).
export async function getPlatformIdentity(): Promise<{ isOwner: boolean; scopes: string[] }> {
  const user = await getAuthUser();
  if (!user) return { isOwner: false, scopes: [] };
  const supabase = await createClient();
  const [{ data: member }, { data: scopes }] = await Promise.all([
    supabase.from("platform_members").select("is_owner").eq("user_id", user.id).maybeSingle(),
    supabase.from("platform_scopes").select("scope").eq("user_id", user.id),
  ]);
  return { isOwner: member?.is_owner ?? false, scopes: (scopes ?? []).map((s) => s.scope as string) };
}
