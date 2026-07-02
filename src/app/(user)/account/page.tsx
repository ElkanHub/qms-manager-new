import { requireUser, getMyRoles } from "@/lib/auth";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SignOutButton } from "./SignOutButton";

// S-ACCOUNT — a user's own minimal account view + MFA/device management.
// No self-service role changes (roles are granted by QA, Phase 4).
export default async function Account() {
  const user = await requireUser();
  const roles = await getMyRoles();

  const name = user.full_name ?? user.email;
  const initials = (user.full_name ?? user.email)
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-2">
      <PageHeader title="Account" actions={<SignOutButton />} />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <CardTitle>{name}</CardTitle>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Department</span>
            <span className="font-medium">{user.department_id ?? "—"}</span>
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
                <span className="font-medium">{user.initial_role ?? "—"}</span>
              )}
            </div>
          </div>

          <Separator />

          <p className="text-sm text-muted-foreground">
            Theme follows your system preference by default — switch it any time from the
            toggle in the top bar.
          </p>

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
    </div>
  );
}
