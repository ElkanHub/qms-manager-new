import { StatusBadge } from "@/components/app/status-badge";
import { cn } from "@/lib/utils";

// Page title block (UI_BUILD_PLAN §6.4). Base variant = title + optional
// description + right-side action slot. Detail variant adds an overline
// (number/type), a status badge and a meta line.
export function PageHeader({
  title,
  description,
  actions,
  overline,
  status,
  meta,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Detail variant: small overline above the title (e.g. document number/type). */
  overline?: string;
  /** Detail variant: status shown top-right, above the actions. */
  status?: string;
  /** Detail variant: meta line under the title (revision · date · department). */
  meta?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="space-y-1">
        {overline && (
          <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
            {overline}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
      </div>
      <div className="flex items-center gap-2">
        {status && <StatusBadge value={status} />}
        {actions}
      </div>
    </div>
  );
}
