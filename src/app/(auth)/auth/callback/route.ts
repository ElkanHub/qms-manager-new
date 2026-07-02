import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth callback: exchange the code for a session cookie, then route the user.
// A user with no bound app account (no `users` row) is sent to a dead-end — there
// is no signup fallback (rule 0.5). MFA enforcement happens on protected screens.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/start";

  if (!code) return NextResponse.redirect(new URL("/signin", url.origin));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/signin?error=auth", url.origin));

  return NextResponse.redirect(new URL(next, url.origin));
}
