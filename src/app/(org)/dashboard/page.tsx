import Link from "next/link";
import { Suspense } from "react";
import { Flag, PencilRuler } from "lucide-react";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardWidget, WidgetSkeleton, type WidgetCtx } from "./widgets";
import { StatusStrip } from "./status-strip";
import { DEFAULT_LAYOUTS, normalizeConfig, type WidgetConfig } from "./widget-catalogue";

// D-DASHBOARD — the configurable dashboard. Everyone gets the layout QA
// designed for their department (falling back to the base Admin/Employee
// dashboard, then to the code defaults), so each department sees the
// information that matters to it. QA can preview any audience via
// ?preview=admin|employee&dept=<id>. Counts and lists are RLS-scoped.
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; dept?: string }>;
}) {
  const user = await requireOrgUser();
  const roles = await getMyRoles();
  const isQA = roles.includes("qa");
  const supabase = await createClient();

  // Audience: admins (QA / Org-Admin / HOD) get the admin dashboard, everyone
  // else the employee one. QA may preview either, for any department.
  const params = await searchParams;
  const naturalKind: "admin" | "employee" =
    isQA || roles.includes("org_admin") || roles.includes("hod") ? "admin" : "employee";
  const previewing = isQA && (params.preview === "admin" || params.preview === "employee");
  const kind = previewing ? (params.preview as "admin" | "employee") : naturalKind;
  const departmentId = previewing ? (params.dept || null) : (user.department_id ?? null);

  // Resolution: department override → base → code default.
  const { data: configs } = await supabase
    .from("dashboard_configs")
    .select("audience, department_id, widgets")
    .eq("audience", kind);
  const deptRow = departmentId
    ? configs?.find((c) => c.department_id === departmentId)
    : undefined;
  const baseRow = configs?.find((c) => c.department_id === null);
  const layout: WidgetConfig[] =
    (deptRow && normalizeConfig(deptRow.widgets).length ? normalizeConfig(deptRow.widgets) : null) ??
    (baseRow && normalizeConfig(baseRow.widgets).length ? normalizeConfig(baseRow.widgets) : null) ??
    DEFAULT_LAYOUTS[kind];

  const ctx: WidgetCtx = { userId: user.id, departmentId };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Dashboard"
        actions={
          <>
            {previewing && (
              <Badge variant="secondary" className="mr-1">
                Previewing: {kind === "admin" ? "Admin" : "Employee"}
              </Badge>
            )}
            {isQA && (
              <Button variant="outline" asChild>
                <Link href="/org/dashboards">
                  <PencilRuler aria-hidden />
                  Design dashboards
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/audit">Audit trail →</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/feedback">
                <Flag aria-hidden />
                Flag this
              </Link>
            </Button>
          </>
        }
      />

      {/* Persistent glance — always on, above the configurable grid. */}
      <Suspense fallback={<div className="h-[76px] animate-pulse rounded-lg border bg-muted/30" />}>
        <StatusStrip departmentId={departmentId} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        {layout.map((w, i) => (
          <div
            key={`${w.key}-${i}`}
            // Staggered rise-in as the grid assembles — reads as "alive," not
            // "loading." Delay is capped so late widgets don't visibly lag.
            className={`animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ${
              w.size === "full" ? "lg:col-span-2" : ""
            }`}
            style={{ animationDelay: `${Math.min(i * 60, 400)}ms` }}
          >
            <Suspense fallback={<WidgetSkeleton size={w.size ?? "half"} />}>
              <DashboardWidget k={w.key} ctx={ctx} />
            </Suspense>
          </div>
        ))}
      </div>
    </div>
  );
}
