"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";

// S-SIGNIN — Google SSO only. No password fields, no "create account" / "sign up"
// link anywhere. The absence of a signup path is itself the requirement (rule 0.5).
export default function SignIn() {
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${env.siteUrl()}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-neutral-600">Use your Google account.</p>
      </div>
      <button
        onClick={signInWithGoogle}
        className="rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-neutral-50"
      >
        Continue with Google
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-neutral-500">
        Access is by invitation only. There is no public sign-up. If you were invited,
        open the link in your invitation email.
      </p>
    </main>
  );
}
