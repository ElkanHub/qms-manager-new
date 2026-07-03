import { Skeleton } from "@/components/ui/skeleton";

// Document read skeleton (UI_BUILD_PLAN §6.4): header with overline/title/meta,
// tab strip, then the tall viewer frame — matches D-READ's real layout.
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-80" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-9 w-64" />
      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-[60vh] w-full rounded-none" />
      </div>
    </div>
  );
}
