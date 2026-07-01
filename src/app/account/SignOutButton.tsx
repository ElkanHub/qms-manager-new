"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.push("/signin");
  }
  return (
    <button onClick={signOut} className="text-sm text-neutral-500 underline hover:text-neutral-800">
      Sign out
    </button>
  );
}
