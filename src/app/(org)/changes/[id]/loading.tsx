import { Skeleton } from "@/components/ui/skeleton";

// Change workstation skeleton (UI_BUILD_PLAN §6.4): header, the state timeline
// spine, then stacked section cards — matches D-CHANGE-WORK's real layout.
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-3 w-full max-w-16" />
            </div>
          ))}
        </div>
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-9 w-32" />
        </div>
      ))}
    </div>
  );
}
