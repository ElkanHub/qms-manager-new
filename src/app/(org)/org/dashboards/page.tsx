import { redirect } from "next/navigation";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { normalizeConfig, type WidgetConfig } from "../../dashboard/widget-catalogue";
import { DashboardDesigner } from "./designer";

export type ConfigMap = Record<string, WidgetConfig[]>;

// S-DASHBOARD-DESIGN — QA designs what every audience sees on their dashboard:
// the two base dashboards (Admin, Employee) and a per-department override on
// top of either. Everyone in a department gets that department's design.
export default async function DashboardsPage() {
  await requireOrgUser();
  if (!(await getMyRoles()).includes("qa")) redirect("/dashboard");
  const supabase = await createClient();

  const [{ data: departments }, { data: configs }] = await Promise.all([
    supabase.from("departments").select("id, name, is_default").order("name"),
    supabase.from("dashboard_configs").select("audience, department_id, widgets"),
  ]);

  // "admin:base", "employee:<deptId>" → stored layout.
  const configMap: ConfigMap = {};
  for (const c of configs ?? []) {
    configMap[`${c.audience}:${c.department_id ?? "base"}`] = normalizeConfig(c.widgets);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-2">
      <PageHeader
        title="Dashboard design"
        description="Design what each audience sees on their dashboard. The two base dashboards (Admin and Employee) apply org-wide; a department override replaces the base for everyone in that department. Every change is audited."
      />
      <DashboardDesigner
        departments={(departments ?? []).map((d) => ({ id: d.id, name: d.name }))}
        configMap={configMap}
      />
    </div>
  );
}
