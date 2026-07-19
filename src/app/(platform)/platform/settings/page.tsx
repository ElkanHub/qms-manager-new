import { requirePlatformUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "@/components/app/settings-client";

// S-SETTINGS (platform plane) — rendered inside the platform shell for the same
// consistency as the org plane. Platform users have no signature/department; the
// Account and Preferences tabs plus the Administration link grid still apply.
export default async function PlatformSettings() {
  const user = await requirePlatformUser();
  const supabase = await createClient();
  const { data: prefs } = await supabase
    .from("user_prefs")
    .select("sound_enabled")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <SettingsClient
      name={user.full_name ?? user.email}
      email={user.email}
      department="—"
      roles={[]}
      plane="platform"
      avatarUrl={user.avatar_url}
      initialSignature={null}
      soundEnabled={prefs?.sound_enabled ?? true}
    />
  );
}
