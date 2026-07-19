import { cookies } from "next/headers";
import { requirePlatformUser, getPlatformIdentity } from "@/lib/auth";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/app-sidebar";
import { AppHeader } from "@/components/app/app-header";

// Platform shell (UI_BUILD_PLAN §4.4). Same skeleton as the org shell, marked
// distinct by the "Platform plane" badge so operators always know which plane
// they're on. Scope enforcement stays server-side.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformUser();
  const { scopes } = await getPlatformIdentity();
  const cookieStore = await cookies();
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar plane="platform" orgName="Platform" roles={scopes} />
      <SidebarInset>
        <AppHeader plane="platform" roles={scopes} name={user.full_name} email={user.email} />
        <div className="flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
