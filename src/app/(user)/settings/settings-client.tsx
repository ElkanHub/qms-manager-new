"use client";

import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SectionCard } from "@/components/app/section-card";
import { PageHeader } from "@/components/app/page-header";
import { SignatureCapture } from "@/components/app/signature-capture";
import { UserCircle, PenTool, SlidersHorizontal, ShieldCheck } from "lucide-react";
import { orgNav, platformNav, type NavItem } from "@/components/app/nav";
import { SignOutButton } from "../account/SignOutButton";
import { SoundToggle } from "../account/sound-toggle";

// S-SETTINGS — a user's personal hub, tabbed. Account details are the first tab
// (previously the standalone /account page). Signature is org-only; the
// Administration tab is a plane-aware link grid for admins, sourced from nav.ts
// so it stays in lock-step with the sidebar. No self-service role changes.
export function SettingsClient({
  name,
  email,
  department,
  roles,
  plane,
  initialSignature,
  soundEnabled,
}: {
  name: string;
  email: string;
  department: string;
  roles: string[];
  plane: "org" | "platform";
  initialSignature: string | null;
  soundEnabled: boolean;
}) {
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const canSee = (item: NavItem) => !item.roles || item.roles.some((r) => roles.includes(r));
  const isOrgAdmin = roles.includes("qa") || roles.includes("org_admin");

  // Admin destinations, plane-aware and role-filtered — reused verbatim from the
  // sidebar's nav definition so there's one source of truth.
  const adminGroups =
    plane === "platform"
      ? platformNav.filter((g) => g.label === "Operations")
      : orgNav
          .filter((g) => g.label === "Quality system" || g.label === "Administration")
          .map((g) => ({ ...g, items: g.items.filter(canSee) }))
          .filter((g) => g.items.length > 0);

  const showAdmin = (plane === "platform" || isOrgAdmin) && adminGroups.length > 0;
  const showSignature = plane === "org";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-2">
      <PageHeader title="Settings" description="Your account, preferences, and administration." actions={<SignOutButton />} />

      <Tabs defaultValue="account">
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="account" className="gap-1.5">
            <UserCircle className="size-4" /> Account
          </TabsTrigger>
          {showSignature && (
            <TabsTrigger value="signature" className="gap-1.5">
              <PenTool className="size-4" /> Signature
            </TabsTrigger>
          )}
          <TabsTrigger value="preferences" className="gap-1.5">
            <SlidersHorizontal className="size-4" /> Preferences
          </TabsTrigger>
          {showAdmin && (
            <TabsTrigger value="administration" className="gap-1.5">
              <ShieldCheck className="size-4" /> Administration
            </TabsTrigger>
          )}
        </TabsList>

        {/* Account */}
        <TabsContent value="account" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarFallback>{initials || "?"}</AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <CardTitle>{name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{email}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Department</span>
                <span className="font-medium">{department}</span>
              </div>
              <div className="flex items-start justify-between gap-4 text-sm">
                <span className="text-muted-foreground">Roles</span>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {roles.length ? (
                    roles.map((r) => (
                      <Badge key={r} variant="secondary">
                        {r}
                      </Badge>
                    ))
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4 text-sm">
                <div>
                  <p className="font-medium text-foreground">Multi-factor authentication</p>
                  <p className="text-muted-foreground">
                    MFA is mandatory. You cannot disable it — only satisfy it. Manage your
                    authenticator and trusted devices from your sign-in.
                  </p>
                </div>
                <Badge>enrolled</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Signature (org only) */}
        {showSignature && (
          <TabsContent value="signature" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Signature</CardTitle>
              </CardHeader>
              <CardContent>
                {/* The signature used when signing documents — replaceable any time;
                    every capture is audited. Initials regenerate from the name. */}
                <SignatureCapture fullName={name} initialSignature={initialSignature} />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Preferences */}
        <TabsContent value="preferences" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Preferences</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Theme follows your system preference by default — switch it any time from the
                toggle in the top bar.
              </p>
              <Separator />
              <SoundToggle initial={soundEnabled} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Administration (admin only, plane-aware) */}
        {showAdmin && (
          <TabsContent value="administration" className="mt-6 space-y-6">
            {adminGroups.map((group) => (
              <SectionCard key={group.label} title={group.label} contentClassName="p-2">
                <div className="grid gap-1 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-start gap-3 rounded-md p-3 hover:bg-muted"
                    >
                      <item.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                      <div className="text-sm font-medium text-foreground">{item.label}</div>
                    </Link>
                  ))}
                </div>
              </SectionCard>
            ))}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
