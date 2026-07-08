"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { AuthShell } from "@/components/app/auth-shell";

// S-MFA — mandatory second factor. Enrolls TOTP on first use, otherwise challenges.
// "Remember this device" records a trusted device so returning users on known
// devices aren't re-challenged within the configured window (FOUNDATIONS §6.3).
// MFA cannot be skipped — it can only be satisfied.
export default function Mfa() {
  const router = useRouter();
  const supabase = createClient();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.find((f) => f.status === "verified");
      if (verified) {
        setFactorId(verified.id);
      } else {
        const enroll = await supabase.auth.mfa.enroll({ factorType: "totp" });
        if (enroll.error) return setError(enroll.error.message);
        setFactorId(enroll.data.id);
        setQr(enroll.data.totp.qr_code);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify() {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const ch = await supabase.auth.mfa.challenge({ factorId });
    if (ch.error) return fail(ch.error.message);
    const v = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code });
    if (v.error) return fail(v.error.message);

    if (remember) {
      // Opaque per-device token → store only its hash server-side.
      const token = crypto.randomUUID();
      const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const hash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
      document.cookie = `qms_device=${token}; Max-Age=${env.mfaTrustedDeviceDays() * 86400}; Path=/; SameSite=Lax`;
      await supabase.rpc("remember_device", { p_device_hash: hash, p_days: env.mfaTrustedDeviceDays() });
    }
    router.push("/start");
  }

  function fail(msg: string) {
    setBusy(false);
    setError(msg);
  }

  // ponytail: TOTP codes come from the authenticator app, so "resend" just
  // re-issues a challenge and clears the field — same MFA calls, no new flow.
  async function resend() {
    if (!factorId) return;
    setCode("");
    setError(null);
    const ch = await supabase.auth.mfa.challenge({ factorId });
    if (ch.error) setError(ch.error.message);
  }

  return (
    <AuthShell
      headline={{
        title: "One more step.",
        body: "Confirm it's really you. Multi-factor keeps your QMS-MANAJA workspace locked to you alone.",
      }}
    >
      <div className="space-y-6">
        <div className="space-y-1.5 text-center lg:text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Step 2 of 2
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Verify it&apos;s you</h1>
          <p className="text-sm text-muted-foreground">
            {qr
              ? "Scan the QR code with your authenticator app, then enter the 6-digit code."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>

        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="MFA QR code" className="mx-auto h-40 w-40 rounded-md border bg-white p-1" />
        )}

        <div className="flex justify-center lg:justify-start">
          <InputOTP maxLength={6} value={code} onChange={setCode} disabled={busy}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="remember"
            checked={remember}
            onCheckedChange={(c) => setRemember(c === true)}
          />
          <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
            Remember this device
          </Label>
        </div>

        <Button onClick={verify} disabled={busy || code.length < 6} size="lg" className="w-full">
          Verify
        </Button>

        {error && <p className="text-center text-sm text-destructive lg:text-left">{error}</p>}

        <p className="text-center text-xs text-muted-foreground lg:text-left">
          Didn&apos;t get a code?{" "}
          <button
            type="button"
            onClick={resend}
            disabled={busy}
            className="font-medium text-foreground underline underline-offset-4 disabled:opacity-40"
          >
            Resend
          </button>
        </p>
      </div>
    </AuthShell>
  );
}
