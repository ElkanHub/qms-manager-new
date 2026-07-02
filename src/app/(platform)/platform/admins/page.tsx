import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { requirePlatformUser, getPlatformIdentity } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GrantAdminDialog } from "./grant-admin-dialog";

// S-PLATFORM-ADMINS — owner-only. Invite platform admins and set each one's granular
// scope. Mirrors the org's role-granting, at the platform plane (least-privilege).
export default async function PlatformAdmins() {
  await requirePlatformUser();
  const { isOwner } = await getPlatformIdentity();
  if (!isOwner) redirect("/platform");

  const admin = createAdminClient();
  const { data: members } = await admin.from("platform_members").select("user_id, is_owner");
  const { data: users } = await admin.from("users").select("id, email").eq("plane", "platform");
  const { data: scopes } = await admin.from("platform_scopes").select("user_id, scope");
  const emailOf = (id: string) => users?.find((u) => u.id === id)?.email ?? id;
  const scopesOf = (id: string) =>
    (scopes ?? []).filter((s) => s.user_id === id).map((s) => s.scope);

  const rows = members ?? [];
  const hasAdmins = rows.some((m) => !m.is_owner);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Admins"
        description="Platform admins and their least-privilege scopes."
        actions={<GrantAdminDialog />}
      />

      {!hasAdmins ? (
        <EmptyState icon={Users} message="No platform admins beyond the owner yet." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Admin</TableHead>
              <TableHead>Scopes</TableHead>
              <TableHead>Owner</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.user_id}>
                <TableCell className="font-medium">{emailOf(m.user_id)}</TableCell>
                <TableCell>
                  {m.is_owner ? (
                    <span className="text-sm text-muted-foreground">All scopes</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {scopesOf(m.user_id).length ? (
                        scopesOf(m.user_id).map((s) => (
                          <Badge key={s} variant="secondary">
                            {s}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">No scopes</span>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {m.is_owner && <Badge>Owner</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
