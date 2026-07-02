import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/app/breadcrumbs";
import { CommandMenu, type CommandDoc } from "@/components/app/command-menu";
import { ModeToggle } from "@/components/app/mode-toggle";
import { UserMenu } from "@/components/app/user-menu";

// Sticky shell header (UI_BUILD_PLAN §4.1). Trigger · breadcrumbs · spacer ·
// command menu · theme · avatar. Platform plane shows a "Platform plane" badge.
export function AppHeader({
  plane,
  roles,
  name,
  email,
  breadcrumbLabels,
  documents,
}: {
  plane: "org" | "platform";
  roles: string[];
  name: string | null;
  email: string;
  breadcrumbLabels?: Record<string, string>;
  documents?: CommandDoc[];
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-6" />
      <Breadcrumbs labels={breadcrumbLabels} documents={documents} />
      {plane === "platform" && (
        <Badge variant="outline" className="ml-2">
          Platform plane
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-2">
        <CommandMenu plane={plane} roles={roles} documents={documents} />
        <ModeToggle />
        <UserMenu name={name} email={email} />
      </div>
    </header>
  );
}
