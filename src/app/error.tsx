"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shared error boundary with retry (UI_BUILD_PLAN §6.4). Per-route error.tsx can
// override; this is the app-wide fallback.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred."}
        </p>
      </div>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
