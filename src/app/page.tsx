import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

// Root landing. No public signup exists (rule 0.5) — the only door in is Sign in.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-6" />
          <h1 className="text-3xl font-semibold">QMS Manager</h1>
        </div>
        <p className="text-muted-foreground">
          Controlled, multi-tenant quality management. Access is invite-only.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/signin">Sign in</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        No account? You can only join by invitation from your organization&apos;s QA.
        There is no public sign-up.
      </p>
    </main>
  );
}
