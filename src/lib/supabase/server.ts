import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

// Request-scoped Supabase client bound to the user's session cookies.
// Runs as the authenticated user → RLS applies (rule 0.2). Use this for all
// user-initiated reads/writes so tenant isolation is enforced by the database.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component where cookies are read-only — safe to ignore;
          // middleware refreshes the session.
        }
      },
    },
  });
}
