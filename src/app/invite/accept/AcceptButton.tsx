"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";

// Google button that returns to this accept page (token preserved) after OAuth.
export function SignInToAccept({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  async function go() {
    const supabase = createClient();
    const next = `/invite/accept?token=${encodeURIComponent(token)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${env.siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) setError(error.message);
  }
  return (
    <>
      <button
        onClick={go}
        className="rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
      >
        Continue with Google to accept
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </>
  );
}
