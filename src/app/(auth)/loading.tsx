import { Skeleton } from "@/components/ui/skeleton";

// Loading fallback for auth routes (centered card splash, UI_BUILD_PLAN §7.1).
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-4 rounded-xl border p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
