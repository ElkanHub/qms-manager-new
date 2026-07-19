"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

// Set the current user's profile photo. The image is a small data URL (the
// client downscales before calling); save_user_avatar validates and audits it.
export async function saveAvatar(image: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_user_avatar", { p_image: image });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

// Remove the photo, reverting the UI to initials.
export async function clearAvatar(): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_user_avatar");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}
