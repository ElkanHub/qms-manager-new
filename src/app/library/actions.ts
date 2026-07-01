"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Toggle a favorite (presentation convenience). Server enforces tenant via the RPC.
export async function toggleFavorite(formData: FormData): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("toggle_favorite", { p_document: String(formData.get("document_id")) });
  revalidatePath("/library");
}
