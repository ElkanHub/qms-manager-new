import { cookies } from "next/headers";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getQueueCounts } from "@/lib/queue-counts";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppHeader } from "@/components/app/app-header";
import { PulseSidebar } from "@/components/app/pulse-sidebar";

// Org shell (UI_BUILD_PLAN §4.1). Guards the whole tenant-facing surface, then
// wraps every org page in the collapsible sidebar + sticky header. Role list is
// display-only; each page's RPCs re-check authority.
export default async function OrgLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOrgUser();
  const [roles, counts, supabase, cookieStore] = await Promise.all([
    getMyRoles(),
    getQueueCounts(),
    createClient(),
    cookies(),
  ]);
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  // Documents are no longer preloaded here — the ⌘K palette searches
  // server-side and breadcrumbs resolve labels with a single cached lookup.
  const [{ data: org }, { data: mods }, { data: prefs }, { data: departments }] = await Promise.all([
    supabase.from("organizations").select("name").eq("tenant_id", user.tenant_id).maybeSingle(),
    supabase.from("tenant_modules").select("module_key, enabled, config"),
    supabase.from("user_prefs").select("sound_enabled").eq("user_id", user.id).maybeSingle(),
    supabase.from("departments").select("id, name").order("name"),
  ]);
  const moduleStates = Object.fromEntries((mods ?? []).map((m) => [m.module_key, m.enabled]));
  // Platform's per-module choice for off items: hide them, or keep them as a
  // greyed upsell (the default). Only off items honour this.
  const moduleHidden = Object.fromEntries(
    (mods ?? []).map((m) => [m.module_key, (m.config as { hidden?: boolean } | null)?.hidden === true]),
  );
  const isQaOrAdmin = roles.includes("qa") || roles.includes("org_admin");
  const canBroadcast = isQaOrAdmin || roles.includes("hod");
  const deptName = (departments ?? []).find((d) => d.id === user.department_id)?.name;

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar
        plane="org"
        orgName={org?.name ?? "QMS Manager"}
        roles={roles}
        counts={counts}
        moduleStates={moduleStates}
        moduleHidden={moduleHidden}
        userName={user.full_name ?? user.email}
        userSubtitle={deptName ?? user.email}
        avatarUrl={user.avatar_url}
      />
      <SidebarInset>
        <AppHeader
          plane="org"
          roles={roles}
          name={user.full_name}
          email={user.email}
          avatarUrl={user.avatar_url}
          moduleStates={moduleStates}
        />
        {/* Pages currently supply their own <main>; a div keeps a single landmark
            until pages are rebuilt onto PageHeader (§7). */}
        <div className="flex-1">{children}</div>
      </SidebarInset>
      <PulseSidebar
        modules={{
          pulse: moduleStates["pulse"] === true,
          broadcasts: moduleStates["broadcasts"] === true,
          messages: moduleStates["messages"] === true,
        }}
        soundEnabled={prefs?.sound_enabled ?? true}
        canBroadcast={canBroadcast}
        departments={(departments ?? []).map((d) => ({ id: d.id, name: d.name }))}
        myDepartmentId={user.department_id ?? null}
        isQaOrAdmin={isQaOrAdmin}
      />
    </SidebarProvider>
  );
}
