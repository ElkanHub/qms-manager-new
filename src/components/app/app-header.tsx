import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/app/breadcrumbs";
import { CommandMenu } from "@/components/app/command-menu";
import { ModeToggle } from "@/components/app/mode-toggle";
import { UserMenu } from "@/components/app/user-menu";

// Sticky shell header (UI_BUILD_PLAN §4.1). Trigger · breadcrumbs · spacer ·
// command menu · theme · avatar. Platform plane shows a "Platform plane" badge.
export function AppHeader({
  plane,
  roles,
  name,
  email,
  avatarUrl,
  breadcrumbLabels,
  moduleStates,
}: {
  plane: "org" | "platform";
  roles: string[];
  name: string | null;
  email: string;
  avatarUrl?: string | null;
  breadcrumbLabels?: Record<string, string>;
  moduleStates?: Record<string, boolean>;
}) {
  const settingsHref = plane === "platform" ? "/platform/settings" : "/settings";
  return (
    // Brand-colored bar (navy→blue gradient, constant across themes). The `dark`
    // class flips the subtree to the dark token set so every control reads as
    // light-on-navy — the same trick the platform sidebar relies on.
    <header className="dark sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-white/10 bg-gradient-to-r from-brand-navy to-brand-blue px-4 text-white">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <Breadcrumbs labels={breadcrumbLabels} />
      {plane === "platform" && (
        <Badge variant="outline" className="ml-2">
          Platform plane
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-2">
        <CommandMenu plane={plane} roles={roles} moduleStates={moduleStates} />
        <ModeToggle />
        <UserMenu name={name} email={email} avatarUrl={avatarUrl} settingsHref={settingsHref} />
      </div>
    </header>
  );
}
