import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type TimelineStage = {
  label: string;
  /** "done" | "current" | "upcoming" | "detour" (amber, e.g. queued/clarification). */
  state?: "done" | "current" | "upcoming" | "detour";
};

// The change pipe and retirement pipe spine (UI_BUILD_PLAN §6.4, §7.6). Horizontal
// on desktop, vertical on mobile. Markers show done/current/upcoming; detours
// (queued, clarification) render amber.
export function StateTimeline({
  stages,
  className,
}: {
  stages: TimelineStage[];
  className?: string;
}) {
  return (
    <ol
      className={cn(
        "flex flex-col gap-4 md:flex-row md:items-start md:gap-0",
        className,
      )}
    >
      {stages.map((s, i) => {
        const state = s.state ?? "upcoming";
        const done = state === "done";
        const current = state === "current";
        const detour = state === "detour";
        return (
          <li
            key={`${s.label}-${i}`}
            className="flex items-center gap-2 md:flex-1 md:flex-col md:gap-2 md:text-center"
          >
            <div className="flex items-center gap-2 md:w-full md:flex-col">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  done && "border-status-effective bg-status-effective/15 text-status-effective",
                  current && "border-primary bg-primary text-primary-foreground",
                  detour && "border-status-blocked bg-status-blocked/15 text-status-blocked",
                  !done && !current && !detour && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              {/* connector (desktop only, not after the last item) */}
              {i < stages.length - 1 && (
                <span
                  className={cn(
                    "hidden h-px flex-1 md:block",
                    done ? "bg-status-effective/40" : "bg-border",
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                "text-xs",
                current ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
