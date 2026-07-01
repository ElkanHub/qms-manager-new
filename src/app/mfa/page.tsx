"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";

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
    router.push("/account");
  }

  function fail(msg: string) {
    setBusy(false);
    setError(msg);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 p-8">
      <h1 className="text-2xl font-semibold">Verify it&apos;s you</h1>
      {qr && (
        <div>
          <p className="text-sm text-neutral-600">Scan this with your authenticator app, then enter the code.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="MFA QR code" className="mt-2 h-40 w-40" />
        </div>
      )}
      <input
        inputMode="numeric"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="123456"
        className="rounded-md border border-neutral-300 px-3 py-2 text-center tracking-widest"
      />
      <label className="flex items-center gap-2 text-sm text-neutral-700">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember this device
      </label>
      <button
        onClick={verify}
        disabled={busy || code.length < 6}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        Verify
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
