import Link from "next/link";
import { requirePlatformUser, getPlatformIdentity } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// S-PLATFORM-HOME — the platform operator's landing surface. Tenant list + entry
// points to provisioning, admins, the switchboard, and the access gate. Cross-tenant
// metadata (tenant list) is platform oversight — NOT tenant controlled data (§4.3).
export default async function PlatformHome() {
  await requirePlatformUser();
  const { isOwner, scopes } = await getPlatformIdentity();
  const admin = createAdminClient();
  const { data: tenants } = await admin.from("tenants").select("id, name, status, created_at").order("created_at");

  const links = [
    { href: "/platform/provision", title: "Provision tenant", show: isOwner || scopes.includes("provision_tenants") },
    { href: "/platform/admins", title: "Platform admins", show: isOwner },
    { href: "/platform/switchboard", title: "Module switchboard", show: isOwner || scopes.includes("switchboard") },
    { href: "/platform/onboarding", title: "Onboarding flows", show: isOwner || scopes.includes("switchboard") },
    { href: "/platform/access", title: "Break-glass access", show: isOwner || scopes.includes("access_gate") },
    { href: "/platform/gate-config", title: "Gate config", show: isOwner },
    { href: "/platform/verify", title: "Audit integrity", show: true },
  ].filter((l) => l.show);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <p className="text-sm text-neutral-500">Platform admin board</p>
      <h1 className="text-2xl font-semibold">{isOwner ? "Owner" : "Platform admin"}</h1>

      <div className="mt-6 flex flex-wrap gap-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href}
            className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm hover:border-neutral-400">
            {l.title}
          </Link>
        ))}
      </div>

      <h2 className="mt-10 text-sm font-semibold text-neutral-700">Tenants</h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-2">Name</th><th>Status</th><th>Created</th>
          </tr>
        </thead>
        <tbody>
          {(tenants ?? []).map((t) => (
            <tr key={t.id} className="border-b border-neutral-100">
              <td className="py-2">{t.name}</td>
              <td>{t.status}</td>
              <td>{new Date(t.created_at).toISOString().slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-neutral-500">
        The tenant list is platform oversight. Tenant documents and org audit are not
        shown here — those require the break-glass gate.
      </p>
    </main>
  );
}
