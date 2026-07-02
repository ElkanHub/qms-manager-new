import { Skeleton } from "@/components/ui/skeleton";

// Shell-level loading fallback for every org route (UI_BUILD_PLAN §6.4, §9).
// A neutral header + table/card skeleton that matches the common list layout.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="space-y-3 rounded-lg border p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
