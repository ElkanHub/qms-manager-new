import { redirect } from "next/navigation";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { ModuleOffAlert } from "@/components/app/module-off-alert";
import { FlowExplorer } from "./flow-explorer";

// Document Flow Map — a read-only visual of where an SOP sits in the document-
// control flow. Module-gated (flow_map) and role-gated (QA dept / org admin);
// every inspection is audited server-side by flow_inspect (rule 0.3).
export default async function FlowMap() {
  await requireOrgUser();
  const roles = await getMyRoles();
  if (!(roles.includes("qa") || roles.includes("org_admin"))) redirect("/dashboard");

  const supabase = await createClient();
  const { data: mod } = await supabase
    .from("tenant_modules")
    .select("enabled")
    .eq("module_key", "flow_map")
    .maybeSingle();
  const moduleOn = mod?.enabled ?? false;

  // SOP list for the search/dropdown (tenant-scoped by RLS). Effective docs first,
  // then by number/title so the list reads the way people think about it.
  const { data: docs } = await supabase
    .from("documents")
    .select("id, document_number, title, status")
    .order("document_number", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Document flow map"
        description="Search a document and see exactly where it sits in the document-control flow — from intake through effective, change control and retirement. Every look-up is recorded on the audit trail."
      />
      {!moduleOn ? (
        <ModuleOffAlert
          module="Document Flow Map"
          detail="This visual is controlled at the platform level. Nothing here is available until it is enabled for your organization."
        />
      ) : (
        <FlowExplorer documents={docs ?? []} />
      )}
    </div>
  );
}
