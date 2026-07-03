"use client";

import * as React from "react";
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
import { getDocumentLabel } from "@/lib/document-search";

// Session-lived cache: each document id is looked up once, however many times
// its crumbs render.
const docLabelCache = new Map<string, string>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// /documents has no index page — its crumb reads and links as the SOP Library.
const segmentAlias: Record<string, { label: string; href: string }> = {
  "/documents": { label: "SOP Library", href: "/library" },
};

// Static sub-pages of a document detail route (depth > 2 only, so the top-level
// /changes list keeps its own label).
const tailLabels: Record<string, string> = {
  history: "Version history",
  changes: "Changes",
  draft: "Draft",
  retire: "Retirement request",
};

// Group prefix for dynamic detail routes (routeGroup covers exact static paths).
const prefixGroup: Record<string, string> = {
  documents: "Work",
  changes: "Work",
};

// Breadcrumbs from the shared route manifest (UI_BUILD_PLAN §5). Static segments
// resolve via routeLabels; document ids resolve to "NUMBER · Title" via one
// RLS-scoped lookup (cached); change-control ids render as CC-{short}.
export function Breadcrumbs({ labels }: { labels?: Record<string, string> }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const docId =
    segments[0] === "documents" && segments[1] && UUID_RE.test(segments[1])
      ? segments[1].toLowerCase()
      : null;
  const [docLabel, setDocLabel] = React.useState<string | null>(
    docId ? (docLabelCache.get(docId) ?? null) : null,
  );
  React.useEffect(() => {
    if (!docId) return;
    const cached = docLabelCache.get(docId);
    if (cached) {
      setDocLabel(cached);
      return;
    }
    let live = true;
    getDocumentLabel(docId).then((label) => {
      if (label) docLabelCache.set(docId, label);
      if (live && label) setDocLabel(label);
    });
    return () => {
      live = false;
    };
  }, [docId]);

  // Build cumulative paths, e.g. /documents, /documents/123.
  const crumbs = segments.map((_, i) => "/" + segments.slice(0, i + 1).join("/"));
  if (crumbs.length === 0) return null;

  const groupCrumb =
    routeGroup[pathname] ?? (crumbs.length > 1 ? prefixGroup[segments[0]] : undefined);

  const items = crumbs.map((path, i) => {
    const seg = segments[i];
    const alias = segmentAlias[path];
    let label = labels?.[path] ?? routeLabels[path] ?? alias?.label;
    if (!label && UUID_RE.test(seg)) {
      if (segments[0] === "documents") {
        label = docLabel ?? seg.slice(0, 8);
      } else if (segments[0] === "changes") {
        label = `CC-${seg.slice(0, 8)}`;
      } else {
        label = seg.slice(0, 8);
      }
    }
    if (!label && i >= 2 && tailLabels[seg]) label = tailLabels[seg];
    return {
      path,
      href: alias?.href ?? path,
      label: label ?? decodeURIComponent(seg),
      last: i === crumbs.length - 1,
    };
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
                  <Link href={it.href}>{it.label}</Link>
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
