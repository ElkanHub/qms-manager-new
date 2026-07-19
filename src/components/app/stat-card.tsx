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
    // h-full + flex column keeps every card the same height in its grid row; the
    // label reserves two lines (clamped) and the value is pinned to the bottom,
    // so a long label can never push this card's value out of line with its
    // siblings.
    <Link href={href} className="group block h-full">
      <Card className="flex h-full flex-col p-5 transition-colors group-hover:border-ring">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">{label}</p>
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
        </div>
        <p className="mt-auto pt-2 text-3xl font-semibold tabular-nums">{value}</p>
      </Card>
    </Link>
  );
}
