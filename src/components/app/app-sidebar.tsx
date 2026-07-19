"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Lock, Settings2 } from "lucide-react";
import { fetchQueueCounts } from "@/app/badge-actions";
import { BADGE_EVENT } from "@/lib/badge-refresh";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  userName,
  userSubtitle,
  avatarUrl,
}: {
  plane: "org" | "platform";
  orgName: string;
  roles: string[];
  counts?: Record<string, number>;
  /** Switchboard state per module key; a module-linked item greys out when off. */
  moduleStates?: Record<string, boolean>;
  /** Footer account preview. */
  userName: string;
  userSubtitle: string;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();

  // Live badges: seeded server-side, then kept fresh client-side — a steady
  // poll, an immediate refetch on window focus/visibility and route change,
  // and an instant ping fired by every successful mutation (ActionForm /
  // ReasonDialog dispatch BADGE_EVENT), so a decision updates its count at once.
  const [live, setLive] = useState<Record<string, number>>(counts);
  const inflight = useRef(false);
  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      setLive(await fetchQueueCounts());
    } catch {
      // transient network failure — the next tick retries
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    if (plane !== "org") return;
    const tick = setInterval(refresh, 15000);
    const onWake = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener(BADGE_EVENT, onWake as EventListener);
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      clearInterval(tick);
      window.removeEventListener(BADGE_EVENT, onWake as EventListener);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [plane, refresh]);

  // A navigation usually follows an action — refetch on every route change too.
  useEffect(() => {
    if (plane === "org") void refresh();
  }, [pathname, plane, refresh]);

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

  const settingsHref = plane === "platform" ? "/platform/settings" : "/settings";
  const initials = userName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    // Platform plane is signalled by the header badge + "Platform" label, so the
    // sidebar follows the active theme like the org one (no forced dark subtree —
    // a dark sidebar in light mode reads as broken, not as a plane marker).
    <Sidebar collapsible="icon">
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
                  const count = item.badge ? live[item.badge] : undefined;
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

      <SidebarFooter className="gap-1">
        <SidebarMenu>
          {plane === "org" &&
            orgFooterNav.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.label}>
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive(settingsHref)} tooltip="Settings">
              <Link href={settingsHref}>
                <Settings2 />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Account preview — links into Settings; collapses to just the avatar. */}
        <Link
          href={settingsHref}
          className="flex items-center gap-2 rounded-md p-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Avatar className="size-8 shrink-0">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={userName} />}
            <AvatarFallback className="text-xs">{initials || "?"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-medium">{userName}</div>
            <div className="truncate text-xs text-muted-foreground">{userSubtitle}</div>
          </div>
        </Link>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
