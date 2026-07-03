"use server";

import { randomUUID } from "crypto";
import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SOP_BUCKET } from "@/lib/content-ref";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Upload a Word SOP into the tenant's storage. Registration against the
// tenant's storage cap is the gate: if the register RPC refuses (limit,
// non-Word), the uploaded object is removed again — nothing untracked ever
// stays in the bucket. Returns the storage: ref for content_ref fields.
export async function uploadSop(
  formData: FormData,
): Promise<{ ok: true; ref: string; bytes: number } | { ok: false; error: string }> {
  const user = await requireOrgUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick a file first." };
  if (file.size > MAX_UPLOAD_BYTES)
    return { ok: false, error: "File too large (25 MB max per upload)." };
  const name = file.name.toLowerCase();
  if (!name.endsWith(".docx") && !name.endsWith(".doc"))
    return {
      ok: false,
      error: "Only Microsoft Word files (.docx, .doc) can be uploaded — SOPs are authored in Word.",
    };

  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  const path = `${user.tenant_id}/${randomUUID()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const admin = createAdminClient();
  let { error: upErr } = await admin.storage.from(SOP_BUCKET).upload(path, bytes, {
    contentType:
      name.endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/msword",
  });
  if (upErr && /bucket/i.test(upErr.message)) {
    await admin.storage.createBucket(SOP_BUCKET, { public: false });
    ({ error: upErr } = await admin.storage.from(SOP_BUCKET).upload(path, bytes));
  }
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  // Register against the tenant cap — the refusal path removes the object.
  const supabase = await createClient();
  const { error: regErr } = await supabase.rpc("register_stored_file", {
    p_path: path,
    p_bytes: file.size,
  });
  if (regErr) {
    await admin.storage.from(SOP_BUCKET).remove([path]);
    return { ok: false, error: regErr.message };
  }
  return { ok: true, ref: `storage:${path}`, bytes: file.size };
}
