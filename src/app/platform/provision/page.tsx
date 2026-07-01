import { requirePlatformUser } from "@/lib/auth";
import { ActionForm } from "@/app/_components/ActionForm";
import { provisionTenant } from "../actions";

// S-TENANT-PROVISION — create a tenant + org + default QA department and invite the
// initial QA (the seed that bootstraps the org plane). Audited. Scope-gated server-side.
export default async function Provision() {
  await requirePlatformUser();
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Provision a tenant</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Creates the tenant, its organization, and the default QA department, then invites
        the initial QA. The gate mode defaults to org-approved (consent).
      </p>
      <div className="mt-6">
        <ActionForm action={provisionTenant} submitLabel="Provision">
          <input name="tenant_name" required placeholder="Tenant name"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <input name="org_name" placeholder="Organization name (defaults to tenant name)"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <input name="qa_email" type="email" required placeholder="Initial QA email"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
        </ActionForm>
      </div>
    </main>
  );
}
