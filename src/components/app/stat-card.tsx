import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

// Dashboard stat tile (UI_BUILD_PLAN §7.2). Big tabular value, label, icon; the
// whole card links onward with a subtle ring on hover.
export function StatCard({
  label,
  value,
  href,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  href: string;
  icon?: LucideIcon;
}) {
  return (
    <Link href={href} className="group">
      <Card className="p-5 transition-colors group-hover:border-ring">
        <div className="flex items-start justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
        </div>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      </Card>
    </Link>
  );
}
