import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Empty states say *why* (UI_BUILD_PLAN §1, §6.4): icon, one explanatory
// sentence, optional CTA. Never a bare "no results".
export function EmptyState({
  icon: Icon,
  message,
  action,
  className,
}: {
  icon?: LucideIcon;
  message: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && <Icon className="size-8 text-muted-foreground" aria-hidden />}
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
