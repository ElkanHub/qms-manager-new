import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/app/mode-toggle";

// Cross-plane shell for the user's own surfaces (/account). Deliberately minimal:
// org users AND platform users land here (the org shell would bounce platform
// users to /platform — see requireOrgUser), so this group guards only on a
// signed-in identity. "Back" resolves to the right plane via /start.
export default async function UserLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/start">
            <ArrowLeft />
            Back to app
          </Link>
        </Button>
        <ModeToggle />
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
