import { Skeleton } from "@/components/ui/skeleton";

// Shell-level loading fallback for every platform route (UI_BUILD_PLAN §9).
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <Skeleton className="h-7 w-40" />
      <div className="space-y-3 rounded-lg border p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
