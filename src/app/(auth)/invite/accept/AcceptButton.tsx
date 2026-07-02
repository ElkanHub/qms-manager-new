"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";

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
      <Button onClick={go} variant="outline">
        Continue with Google to accept
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );
}
