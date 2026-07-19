import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "@/components/app/settings-client";

// S-SETTINGS (org plane) — rendered inside the org shell (sidebar + brand header)
// for visual consistency. Account details are the first tab. Server re-checks
// every action; roles here are display-only.
export default async function OrgSettings() {
  const user = await requireOrgUser();
  const roles = await getMyRoles();
  const supabase = await createClient();
  const [{ data: mySig }, { data: prefs }, { data: dept }] = await Promise.all([
    supabase.from("user_signatures").select("image_data").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_prefs").select("sound_enabled").eq("user_id", user.id).maybeSingle(),
    user.department_id
      ? supabase.from("departments").select("name").eq("id", user.department_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <SettingsClient
      name={user.full_name ?? user.email}
      email={user.email}
      department={dept?.name ?? "—"}
      roles={roles}
      plane="org"
      avatarUrl={user.avatar_url}
      initialSignature={mySig?.image_data ?? null}
      soundEnabled={prefs?.sound_enabled ?? true}
    />
  );
}
