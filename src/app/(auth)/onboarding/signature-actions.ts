"use server";

import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

type Result = { ok: true } | { ok: false; error: string };

export async function saveSignature(image: string, source: "drawn" | "uploaded"): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_user_signature", { p_image: image, p_source: source });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// The QR the desktop shows: a single-use, 15-minute signing link for the phone.
export async function createSignatureQr(): Promise<
  { ok: true; url: string; qrDataUrl: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_signature_token");
  if (error || !token) return { ok: false, error: error?.message ?? "Could not create a signing link." };
  const url = `${env.siteUrl()}/sign/${token}`;
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 320 });
  return { ok: true, url, qrDataUrl };
}

export async function signatureStatus(): Promise<{
  hasSignature: boolean;
  source: string | null;
  updatedAt: string | null;
}> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_signature_status");
  const row = data?.[0];
  return {
    hasSignature: row?.has_signature ?? false,
    source: row?.source ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

// The phone page's save: the token is the credential (validated, single-use,
// expiring, audited as the token's owner) — the phone has no session.
export async function saveSignatureByToken(token: string, image: string): Promise<Result> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("save_signature_by_token", { p_token: token, p_image: image });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
