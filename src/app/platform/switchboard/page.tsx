import { redirect } from "next/navigation";
import { requirePlatformUser, getPlatformIdentity } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { setModule } from "../actions";

// S-SWITCHBOARD — per-tenant module on/off + config. Platform-controlled. Every
// change is audited. In-flight policy: turning a module off applies only to flows
// that start after the switch; engaged flows continue under the old setting.
export default async function Switchboard() {
  await requirePlatformUser();
  const { isOwner, scopes } = await getPlatformIdentity();
  if (!isOwner && !scopes.includes("switchboard")) redirect("/platform");

  const admin = createAdminClient();
  const { data: tenants } = await admin.from("tenants").select("id, name").order("name");
  const { data: modules } = await admin.from("modules").select("*").order("label");
  const { data: state } = await admin.from("tenant_modules").select("tenant_id, module_key, enabled, config");
  const cell = (tid: string, mk: string) => state?.find((s) => s.tenant_id === tid && s.module_key === mk);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Module switchboard</h1>
      <p className="mt-1 text-sm text-neutral-600">
        A module off removes a capability — it never breaks a core flow (the core takes
        its safe default). Changes apply to new flows immediately; in-flight flows finish
        under the old setting.
      </p>

      {(tenants ?? []).map((t) => (
        <section key={t.id} className="mt-8">
          <h2 className="text-sm font-semibold">{t.name}</h2>
          <div className="mt-2 space-y-3">
            {(modules ?? []).map((m) => {
              const c = cell(t.id, m.key);
              return (
                <form key={m.key} action={async (fd) => { "use server"; await setModule(fd); }}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm">
                  <input type="hidden" name="tenant_id" value={t.id} />
                  <input type="hidden" name="module_key" value={m.key} />
                  <span className="min-w-40 font-medium">{m.label}</span>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="enabled" defaultChecked={c?.enabled ?? false} /> enabled
                  </label>
                  <input name="config" defaultValue={JSON.stringify(c?.config ?? {})}
                    className="w-56 rounded-md border border-neutral-300 px-2 py-1 font-mono text-xs" />
                  <button className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">
                    Save
                  </button>
                </form>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
