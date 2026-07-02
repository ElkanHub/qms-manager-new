"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.push("/signin");
  }
  return (
    <Button variant="outline" onClick={signOut}>
      Sign out
    </Button>
  );
}
