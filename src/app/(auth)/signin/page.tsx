"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-6 text-foreground" />
            <span className="text-lg font-semibold">QMS Manager</span>
          </div>
          <CardTitle className="pt-2 text-xl">Sign in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={signInWithGoogle} className="w-full gap-2">
            <GoogleGlyph />
            Sign in with Google
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-center text-xs text-muted-foreground">
            Invite-only — contact your QA admin.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
