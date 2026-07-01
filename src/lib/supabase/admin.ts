import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Service-role client — BYPASSES RLS. Use ONLY for platform-plane operations
// that are themselves access-controlled and audited (tenant provisioning,
// invitations, the break-glass gate). Never expose to the browser, never use
// it to sidestep a guard. Every call site must write audit (rule 0.1).
export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
