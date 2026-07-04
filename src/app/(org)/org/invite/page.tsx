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

// The assignable primary roles — the employee baseline plus the two positions.
// Capabilities (signatory, trainer) and QA membership are managed per person on
// Users & roles after the invitee joins.
const PRIMARY_ROLES = [
  { key: "employee", label: "Employee", hint: "The baseline — views effective documents and can author." },
  { key: "hod", label: "HOD / Manager", hint: "Departmental head; endorses their unit's work." },
  { key: "org_admin", label: "Org-Admin", hint: "Manages users and org settings." },
];

// S-INVITE — invite composer (email + department + primary role) plus the
// tenant's recent invitations. Inviting into the QA department is QA-only
// (membership confers approval authority); the server enforces the boundary.
export default async function Invite() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();
  const [{ data: roles }, { data: departments }, { data: invitations }] = await Promise.all([
    supabase.from("roles").select("key, label"),
    supabase.from("departments").select("id, name, is_default").order("name"),
    supabase
      .from("invitations")
      .select("id, email, initial_role, status, expires_at")
      .order("created_at", { ascending: false }),
  ]);
  // Non-QA inviters never see the QA department — its membership is QA-granted.
  const invitableDepts = (departments ?? [])
    .filter((d) => isQA || !d.is_default)
    .map((d) => ({ id: d.id, name: d.is_default ? `${d.name} — confers approval authority` : d.name }));
  const labelOf = (key: string) =>
    PRIMARY_ROLES.find((r) => r.key === key)?.label ??
    (roles ?? []).find((r) => r.key === key)?.label ??
    key;

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
            <Label htmlFor="role">Primary role</Label>
            <Select name="role" defaultValue="employee" required>
              <SelectTrigger id="role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {PRIMARY_ROLES.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    <span className="flex flex-col">
                      <span>{r.label}</span>
                      <span className="text-xs text-muted-foreground">{r.hint}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Capabilities (signatory, trainer) default from the role and are adjusted per person on
              Users &amp; roles. Approval authority comes only from QA-department membership.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="department_id">Department</Label>
            <DepartmentSelect departments={invitableDepts} />
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
