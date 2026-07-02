"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { routeGroup, routeLabels } from "@/components/app/nav";

// Breadcrumbs from the shared route manifest (UI_BUILD_PLAN §5). Static segments
// resolve via routeLabels; a non-linking group crumb (Work/Queues/…) is prefixed
// per routeGroup. Dynamic segments ([id]) resolve to human labels passed in as
// `labels` (path → label) by the page/layout.
export function Breadcrumbs({ labels }: { labels?: Record<string, string> }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  // Build cumulative paths, e.g. /documents, /documents/123.
  const crumbs = segments.map((_, i) => "/" + segments.slice(0, i + 1).join("/"));
  if (crumbs.length === 0) return null;

  const groupCrumb = routeGroup[pathname];

  const items = crumbs.map((path, i) => {
    const label = labels?.[path] ?? routeLabels[path] ?? decodeURIComponent(segments[i]);
    return { path, label, last: i === crumbs.length - 1 };
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {groupCrumb && (
          <>
            <BreadcrumbItem>
              <span className="text-muted-foreground">{groupCrumb}</span>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}
        {items.map((it) => (
          <span key={it.path} className="contents">
            <BreadcrumbItem>
              {it.last ? (
                <BreadcrumbPage className="max-w-[40ch] truncate">{it.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={it.path}>{it.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {!it.last && <BreadcrumbSeparator />}
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
