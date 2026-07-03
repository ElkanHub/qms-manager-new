"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  orgNav,
  orgFooterNav,
  platformNav,
  type NavGroup,
  type NavItem,
} from "@/components/app/nav";
import { ShieldCheck } from "lucide-react";

// The app sidebar (UI_BUILD_PLAN §4.2, §4.4). Role filtering is display-only —
// the server re-checks every action. Queue counts come from the layout's shared
// RLS-scoped helper. Platform plane uses the same skeleton, visually distinct via
// the sidebar tokens + a plane label.
export function AppSidebar({
  plane,
  orgName,
  roles,
  counts = {},
  moduleStates = {},
}: {
  plane: "org" | "platform";
  orgName: string;
  roles: string[];
  counts?: Record<string, number>;
  /** Switchboard state per module key; a module-linked item greys out when off. */
  moduleStates?: Record<string, boolean>;
}) {
  const pathname = usePathname();
  const groups: NavGroup[] = plane === "platform" ? platformNav : orgNav;
  const canSee = (item: NavItem) => !item.roles || item.roles.some((r) => roles.includes(r));
  const isActive = (href: string) =>
    href === pathname || (href !== "/" && pathname.startsWith(href + "/"));
  // Off = greyed, not hidden: the tenant sees what the platform offers and gets
  // nudged toward it — display only; the server guards regardless.
  const moduleOff = (item: NavItem) =>
    plane === "org" && !!item.moduleKey && moduleStates[item.moduleKey] !== true;
  const nudge = (label: string) =>
    toast(`${label} isn't part of your organization's plan yet`, {
      description: "Ask your platform administrator about enabling it for your organization.",
    });

  return (
    // Platform plane is deliberately distinct (§4.4): the `dark` class flips the
    // sidebar subtree to the dark token set (dark-in-light-mode) so operators
    // always know which plane they're on.
    <Sidebar collapsible="icon" className={plane === "platform" ? "dark" : undefined}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <ShieldCheck className="size-5 shrink-0" />
          <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
            {orgName}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group, gi) => {
          const items = group.items.filter(canSee);
          if (items.length === 0) return null;
          return (
            <SidebarGroup key={group.label ?? `g${gi}`}>
              {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarMenu>
                {items.map((item) => {
                  const count = item.badge ? counts[item.badge] : undefined;
                  if (moduleOff(item)) {
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          tooltip={`${item.label} — not in your plan`}
                          className="opacity-50"
                          onClick={() => nudge(item.label)}
                        >
                          <item.icon />
                          <span>{item.label}</span>
                          <Lock className="ml-auto size-3" />
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  }
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label}>
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {count ? <SidebarMenuBadge>{count}</SidebarMenuBadge> : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      {plane === "org" && (
        <SidebarFooter>
          <SidebarMenu>
            {orgFooterNav.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarFooter>
      )}

      <SidebarRail />
    </Sidebar>
  );
}
