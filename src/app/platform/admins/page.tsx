import { redirect } from "next/navigation";
import { requirePlatformUser, getPlatformIdentity } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ActionForm } from "@/app/_components/ActionForm";
import { inviteAdmin } from "../actions";

const SCOPES = ["provision_tenants", "switchboard", "access_gate"];

// S-PLATFORM-ADMINS — owner-only. Invite platform admins and set each one's granular
// scope. Mirrors the org's role-granting, at the platform plane (least-privilege).
export default async function PlatformAdmins() {
  await requirePlatformUser();
  const { isOwner } = await getPlatformIdentity();
  if (!isOwner) redirect("/platform");

  const admin = createAdminClient();
  const { data: members } = await admin.from("platform_members").select("user_id, is_owner");
  const { data: users } = await admin.from("users").select("id, email").eq("plane", "platform");
  const { data: scopes } = await admin.from("platform_scopes").select("user_id, scope");
  const emailOf = (id: string) => users?.find((u) => u.id === id)?.email ?? id;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Platform admins</h1>

      <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {(members ?? []).map((m) => (
          <li key={m.user_id} className="px-4 py-3 text-sm">
            <span className="font-medium">{emailOf(m.user_id)}</span>
            {m.is_owner ? (
              <span className="ml-2 text-xs text-neutral-500">owner (all scopes)</span>
            ) : (
              <span className="ml-2 text-xs text-neutral-500">
                {(scopes ?? []).filter((s) => s.user_id === m.user_id).map((s) => s.scope).join(", ") || "no scopes"}
              </span>
            )}
          </li>
        ))}
      </ul>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold">Invite a platform admin</h2>
        <ActionForm action={inviteAdmin} submitLabel="Create invite">
          <input name="email" type="email" required placeholder="admin@company.com"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm" />
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="text-neutral-500">Scopes</legend>
            {SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input type="checkbox" name="scopes" value={s} /> {s}
              </label>
            ))}
          </fieldset>
        </ActionForm>
      </section>
    </main>
  );
}
