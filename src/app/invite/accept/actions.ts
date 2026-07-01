"use server";

import { getAuthUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Binds the signed-in Google identity to the invitation. The DB function
// app.accept_invitation is the ONLY path that mints an account (rule 0.5); it
// validates the one-time token, expiry, and email match, and audits.
export async function acceptInvitation(
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authUser = await getAuthUser();
  if (!authUser?.email) return { ok: false, error: "Sign in with Google first." };

  const admin = createAdminClient();
  const { error } = await admin.rpc("accept_invitation", {
    p_token: token,
    p_user_id: authUser.id,
    p_email: authUser.email,
    p_full_name: authUser.user_metadata?.full_name ?? null,
    p_source: "S-INVITE-ACCEPT",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
