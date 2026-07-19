"use server";

import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/auth";

// Distinct people active on the org's audit trail in the last 15 minutes.
// Explicitly org-scoped (on top of the tenant-scoped RLS on audit_trail).
export async function getOnlineCount(): Promise<number> {
  const user = await getAppUser();
  if (!user?.org_id) return 0;
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data } = await supabase
    .from("audit_trail")
    .select("actor_email")
    .eq("org_id", user.org_id)
    .gte("occurred_at", cutoff)
    .limit(1000);
  return new Set((data ?? []).map((r) => r.actor_email).filter(Boolean)).size;
}
