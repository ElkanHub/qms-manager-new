import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Content refs come in two shapes:
//   storage:<path>  — a Word file in OUR bucket (uploaded at intake/draft;
//                     tracked against the tenant's storage cap)
//   https://…       — an external file the tenant hosts elsewhere
// The MS-online viewer and the extraction pipeline both need a fetchable
// https URL, so storage refs resolve to a short-lived signed URL at render
// time (the bucket itself stays private).

export const SOP_BUCKET = "sop-files";
const SIGNED_URL_SECONDS = 3600;

export function isStorageRef(ref: string | null): boolean {
  return !!ref && ref.startsWith("storage:");
}

export async function resolveContentUrl(ref: string | null): Promise<string | null> {
  if (!ref) return null;
  if (!isStorageRef(ref)) return ref;
  const path = ref.slice("storage:".length);
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(SOP_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
