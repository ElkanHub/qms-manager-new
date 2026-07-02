import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/app/_components/ActionForm";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail } from "lucide-react";
import { inviteUser } from "../actions";
import { DepartmentSelect } from "./department-select";

const QUALITY_CRITICAL = new Set(["qa", "approver", "signatory"]);

// Short helper descriptions per role (the roles table carries no description column).
const ROLE_HINT: Record<string, string> = {
  author: "Drafts and revises documents.",
  hod: "Head of department; endorses their unit's work.",
  qa: "Quality authority; approves and provisions.",
  approver: "Signs off on document approval.",
  signatory: "Signs controlled documents.",
  trainer: "Assigns and tracks training.",
  org_admin: "Manages users and org settings.",
  viewer: "Read-only access to effective documents.",
};

// S-INVITE — invite composer (email + intended department/role) plus the tenant's
// recent invitations. Quality-critical roles only appear for QA; the server enforces
// the same boundary. All authority/queries are preserved from the original screen.
export default async function Invite() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();
  const [{ data: roles }, { data: departments }, { data: invitations }] = await Promise.all([
    supabase.from("roles").select("*").order("label"),
    supabase.from("departments").select("id, name").order("name"),
    supabase
      .from("invitations")
      .select("id, email, initial_role, status, expires_at")
      .order("created_at", { ascending: false }),
  ]);
  const invitable = (roles ?? []).filter((r) => isQA || !QUALITY_CRITICAL.has(r.key));
  const labelOf = (key: string) => (roles ?? []).find((r) => r.key === key)?.label ?? key;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Invitations"
        description="A one-time, expiring invitation bound to this tenant, department, and role. The invitee signs in with Google; their account is created already bound."
      />

      <SectionCard title="Send invitation" description="The invitation link is shown after creation. Email delivery is wired in a later phase.">
        <ActionForm action={inviteUser} submitLabel="Create invitation">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required placeholder="invitee@company.com" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Initial role</Label>
            <Select name="role" defaultValue={invitable[0]?.key} required>
              <SelectTrigger id="role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {invitable.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    <span className="flex flex-col">
                      <span>{r.label}</span>
                      {ROLE_HINT[r.key] && (
                        <span className="text-xs text-muted-foreground">{ROLE_HINT[r.key]}</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="department_id">Department</Label>
            <DepartmentSelect departments={departments ?? []} />
          </div>
        </ActionForm>
      </SectionCard>

      <SectionCard title="Invitations" description="Every invitation issued for this organization.">
        {invitations && invitations.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>{inv.email}</TableCell>
                  <TableCell>{labelOf(inv.initial_role)}</TableCell>
                  <TableCell className="tabular-nums">
                    {new Date(inv.expires_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={inv.status} dot />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState icon={Mail} message="No pending invitations." />
        )}
      </SectionCard>
    </div>
  );
}
