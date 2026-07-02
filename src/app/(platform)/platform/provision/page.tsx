import { Info } from "lucide-react";
import { requirePlatformUser } from "@/lib/auth";
import { ActionForm } from "@/app/_components/ActionForm";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { provisionTenant } from "../actions";

// S-TENANT-PROVISION — create a tenant + org + default QA department and invite the
// initial QA (the seed that bootstraps the org plane). Audited. Scope-gated server-side.
export default async function Provision() {
  await requirePlatformUser();
  return (
    <div className="mx-auto max-w-lg space-y-6 p-2">
      <PageHeader
        title="Provision"
        description="Creates the tenant, its organization, and the default QA department, then invites the initial QA. The gate mode defaults to org-approved (consent)."
      />
      <SectionCard title="New tenant">
        <ActionForm action={provisionTenant} submitLabel="Provision">
          <div className="space-y-2">
            <Label htmlFor="tenant_name">Tenant name</Label>
            <Input id="tenant_name" name="tenant_name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org_name">Organization name</Label>
            <Input id="org_name" name="org_name" placeholder="Defaults to tenant name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qa_email">Initial QA email</Label>
            <Input id="qa_email" name="qa_email" type="email" required />
          </div>
        </ActionForm>
      </SectionCard>
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Next step: send the returned invite link to the tenant&apos;s initial QA so they can
          accept and bootstrap the organization.
        </AlertDescription>
      </Alert>
    </div>
  );
}
