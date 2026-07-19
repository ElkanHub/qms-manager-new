import { requireUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";

// S-SETTINGS — personal hub for org AND platform users (the (user) group is
// cross-plane). Account details live here as the first tab; admin destinations
// surface via the plane-aware Administration tab. Server re-checks every action.
export default async function Settings() {
  const user = await requireUser();
  const roles = await getMyRoles();
  const supabase = await createClient();
  const [{ data: mySig }, { data: prefs }] = await Promise.all([
    supabase.from("user_signatures").select("image_data").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_prefs").select("sound_enabled").eq("user_id", user.id).maybeSingle(),
  ]);

  return (
    <SettingsClient
      name={user.full_name ?? user.email}
      email={user.email}
      department={user.department_id ?? "—"}
      roles={roles}
      plane={user.plane}
      initialSignature={mySig?.image_data ?? null}
      soundEnabled={prefs?.sound_enabled ?? true}
    />
  );
}
