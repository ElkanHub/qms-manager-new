import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { requestModuleChange } from "../actions";

// S-MODULES-ORG — the org's read-only view of its enabled modules, with a
// "request a change" path back to the platform. The org sees the switchboard state
// but cannot flip it (the platform holds the switch).
export default async function OrgModules() {
  await requireOrgUser();
  const roles = await getMyRoles();
  const mayRequest = roles.includes("qa") || roles.includes("org_admin");

  const supabase = await createClient();
  const { data: modules } = await supabase.from("modules").select("*").order("label");
  const { data: state } = await supabase.from("tenant_modules").select("module_key, enabled, config");
  const enabledOf = (key: string) => state?.find((s) => s.module_key === key)?.enabled ?? false;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Modules</h1>
      <p className="mt-1 text-sm text-neutral-600">
        These are the modules available to your organization. This view is read-only —
        use “request a change” to ask the platform to enable or disable one.
      </p>

      <ul className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {(modules ?? []).map((m) => (
          <li key={m.key} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>
              <span className="font-medium">{m.label}</span>
              <span className="block text-xs text-neutral-500">{m.description}</span>
            </span>
            <span className={`text-xs uppercase ${enabledOf(m.key) ? "text-green-700" : "text-neutral-400"}`}>
              {enabledOf(m.key) ? "enabled" : "off"}
            </span>
          </li>
        ))}
      </ul>

      {mayRequest && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">Request a change</h2>
          <ActionForm action={requestModuleChange} submitLabel="Send request">
            <select name="module_key" required className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              {(modules ?? []).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <select name="desired_enabled" className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
              <option value="enable">enable</option>
              <option value="disable">disable</option>
            </select>
            <input name="note" placeholder="Note (optional)"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          </ActionForm>
        </section>
      )}
    </main>
  );
}
