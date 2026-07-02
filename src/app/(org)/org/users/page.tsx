import Link from "next/link";
import { Users } from "lucide-react";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { Button } from "@/components/ui/button";
import { columns, type UserRow } from "./columns";

const QUALITY_CRITICAL = new Set(["qa", "approver", "signatory"]);

// S-USERS — user & role management. The delegation boundary is reflected here
// (Org-Admins don't see quality-critical role options); the server enforces it.
export default async function UsersPage() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();

  const [{ data: users }, { data: roles }, { data: assignments }, { data: departments }] =
    await Promise.all([
      supabase.from("users").select("*").order("email"),
      supabase.from("roles").select("*").order("label"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("departments").select("id, name").order("name"),
    ]);

  const grantable = (roles ?? [])
    .filter((r) => isQA || !QUALITY_CRITICAL.has(r.key))
    .map((r) => ({ key: r.key, label: r.label }));
  const labelOf = (key: string) => (roles ?? []).find((r) => r.key === key)?.label ?? key;
  const deptOf = (id: string | null) => departments?.find((d) => d.id === id)?.name ?? "—";
  const initialsOf = (s: string) =>
    s
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const rows: UserRow[] = (users ?? []).map((u) => {
    const name = u.full_name ?? u.email;
    return {
      id: u.id,
      name,
      email: u.email,
      initials: initialsOf(name),
      department: deptOf(u.department_id),
      roles: (assignments ?? []).filter((a) => a.user_id === u.id).map((a) => labelOf(a.role)),
      status: u.status,
      roleOptions: grantable,
      isQA,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Users & roles"
        description="Everyone in your organization, the roles they hold, and their access status."
        actions={
          <Button asChild>
            <Link href="/org/invite">Invite user</Link>
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        searchKey="user"
        searchPlaceholder="Search name or email…"
        facets={[
          { columnId: "department", title: "Department" },
          { columnId: "status", title: "Status" },
        ]}
        emptyState={
          <EmptyState
            icon={Users}
            message="No users yet — invite people from your organization."
          />
        }
      />
    </div>
  );
}
