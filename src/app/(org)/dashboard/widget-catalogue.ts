// The dashboard widget catalogue — the single source of truth for what exists,
// shared by the dashboard renderer and the QA design studio. The database only
// ever stores keys/order/size (see set_dashboard_config); markup and queries
// live here in code. Unknown keys in a stored config render nothing, so a
// stale config can never break anyone's dashboard.

export type WidgetSize = "full" | "half";

export type WidgetMeta = {
  key: string;
  title: string;
  description: string;
  /** Who this widget is most useful for — a designer hint, not a restriction. */
  audience: "admin" | "employee" | "both";
  defaultSize: WidgetSize;
};

export type WidgetConfig = { key: string; size?: WidgetSize };

export const WIDGET_CATALOGUE: WidgetMeta[] = [
  {
    key: "quality_kpis",
    title: "Quality KPIs",
    description: "Open change controls, documents due for review, in-flight documents, incomplete training, retention queue.",
    audience: "admin",
    defaultSize: "full",
  },
  {
    key: "approvals_attention",
    title: "Changes needing attention",
    description: "The oldest open change controls, so nothing sits unnoticed.",
    audience: "admin",
    defaultSize: "half",
  },
  {
    key: "periodic_worklist",
    title: "Periodic review worklist",
    description: "Documents due (or overdue) for periodic review in the next 30 days.",
    audience: "admin",
    defaultSize: "half",
  },
  {
    key: "department_overview",
    title: "Department overview",
    description: "Members, effective and in-flight documents, and open changes — per department.",
    audience: "admin",
    defaultSize: "full",
  },
  {
    key: "usage_insights",
    title: "Usage insights",
    description: "Flow completion funnel and busiest screens, derived from the audit trail (QA/Org-Admin data).",
    audience: "admin",
    defaultSize: "full",
  },
  {
    key: "recent_audit",
    title: "Recent activity",
    description: "The latest entries on the tenant audit trail.",
    audience: "admin",
    defaultSize: "half",
  },
  {
    key: "storage_usage",
    title: "Storage",
    description: "SOP file storage used against the tenant limit.",
    audience: "admin",
    defaultSize: "half",
  },
  {
    key: "training_pulse",
    title: "Training pulse",
    description: "Assigned vs completed training across the organization.",
    audience: "admin",
    defaultSize: "half",
  },
  {
    key: "copies_outstanding",
    title: "Outstanding controlled copies",
    description: "Issued copies not yet reconciled, with the oldest issue date.",
    audience: "admin",
    defaultSize: "half",
  },
  {
    key: "my_training",
    title: "My training",
    description: "The signed-in person's open training assignments and due dates.",
    audience: "employee",
    defaultSize: "half",
  },
  {
    key: "my_requests",
    title: "My requests",
    description: "The signed-in person's intake requests and where they stand.",
    audience: "employee",
    defaultSize: "half",
  },
  {
    key: "dept_documents",
    title: "My department's documents",
    description: "Recently updated effective documents in the viewer's department.",
    audience: "employee",
    defaultSize: "half",
  },
  {
    key: "my_broadcasts",
    title: "Announcements to acknowledge",
    description: "Broadcasts awaiting the viewer's acknowledgement.",
    audience: "both",
    defaultSize: "half",
  },
];

export const WIDGET_BY_KEY = new Map(WIDGET_CATALOGUE.map((w) => [w.key, w]));

// Safe defaults — what each audience sees when QA hasn't designed anything yet.
export const DEFAULT_LAYOUTS: Record<"admin" | "employee", WidgetConfig[]> = {
  admin: [
    { key: "quality_kpis", size: "full" },
    { key: "approvals_attention", size: "half" },
    { key: "periodic_worklist", size: "half" },
    { key: "department_overview", size: "full" },
    { key: "usage_insights", size: "full" },
    { key: "recent_audit", size: "half" },
    { key: "storage_usage", size: "half" },
  ],
  employee: [
    { key: "my_training", size: "half" },
    { key: "my_broadcasts", size: "half" },
    { key: "my_requests", size: "half" },
    { key: "dept_documents", size: "half" },
  ],
};

/** Normalize a stored config: drop unknown keys, default sizes. */
export function normalizeConfig(raw: unknown): WidgetConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: WidgetConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const key = (item as Record<string, unknown>).key;
    if (typeof key !== "string") continue;
    const meta = WIDGET_BY_KEY.get(key);
    if (!meta) continue; // stale key from an older catalogue — render nothing
    const size = (item as Record<string, unknown>).size;
    out.push({ key, size: size === "full" || size === "half" ? size : meta.defaultSize });
  }
  return out;
}
