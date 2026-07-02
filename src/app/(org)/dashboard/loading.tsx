import { Skeleton } from "@/components/ui/skeleton";

// Dashboard-shaped skeleton (UI_BUILD_PLAN §6.4): stat-card grid, not a table.
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <div className="flex gap-4">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-lg border p-5">
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
