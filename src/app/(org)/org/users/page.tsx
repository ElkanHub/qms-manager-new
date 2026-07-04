import Link from "next/link";
import { Users } from "lucide-react";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { Button } from "@/components/ui/button";
import { columns, type UserRow, type Department } from "./columns";
import { SpecimenDialog, type SpecimenRow } from "./specimen-dialog";

// S-USERS — user & access management on the three-axis model: department (QA
// membership = approval authority), primary role (employee baseline / HOD /
// Org-Admin), and per-person capabilities (signatory, trainer). The delegation
// boundary is reflected here (non-QA can't touch QA membership or signatory);
// the server enforces it.
export default async function UsersPage() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();

  const [{ data: users }, { data: assignments }, { data: departments },
         { data: signatures }, { data: responses }] =
    await Promise.all([
      supabase.from("users").select("*").order("email"),
      supabase.from("user_roles").select("user_id, role, department_id"),
      supabase.from("departments").select("id, name, is_default").order("name"),
      supabase.from("user_signatures").select("user_id, image_data, source"),
      supabase.from("onboarding_responses").select("user_id, answers"),
    ]);

  const deptOptions: Department[] = (departments ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    isQuality: d.is_default === true,
  }));
  const deptOf = (id: string | null) => deptOptions.find((d) => d.id === id);
  const initialsOf = (s: string) =>
    s
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const rows: UserRow[] = (users ?? []).map((u) => {
    const name = u.full_name ?? u.email;
    const mine = (assignments ?? []).filter((a) => a.user_id === u.id);
    const hod = mine.find((a) => a.role === "hod");
    const primary = hod ? ("hod" as const) : mine.some((a) => a.role === "org_admin") ? ("org_admin" as const) : null;
    return {
      id: u.id,
      name,
      email: u.email,
      initials: initialsOf(name),
      departmentId: u.department_id,
      department: deptOf(u.department_id)?.name ?? "—",
      isQa: mine.some((a) => a.role === "qa") || (deptOf(u.department_id)?.isQuality ?? false),
      primary,
      hodDepartment: hod ? (deptOf(hod.department_id)?.name ?? null) : null,
      capabilities: {
        signatory: mine.some((a) => a.role === "signatory"),
        trainer: mine.some((a) => a.role === "trainer"),
      },
      status: u.status,
      departments: deptOptions,
      callerIsQA: isQA,
    };
  });

  // Profile + signatures attach to the person here (collected at onboarding).
  const specimenRows: SpecimenRow[] = (users ?? []).map((u) => {
    const sig = signatures?.find((x) => x.user_id === u.id);
    const answers = (responses?.find((x) => x.user_id === u.id)?.answers ?? {}) as Record<string, string>;
    return {
      id: u.id,
      name: u.full_name ?? u.email,
      jobTitle: answers.job_title ?? null,
      signature: sig?.image_data ?? null,
      source: sig?.source ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Users & roles"
        description="Everyone in your organization — their department, primary role, capabilities, profile details, and signatures. QA-department membership confers approval authority."
        actions={
          <div className="flex items-center gap-2">
            <SpecimenDialog rows={specimenRows} />
            <Button asChild>
              <Link href="/org/invite">Invite user</Link>
            </Button>
          </div>
        }
      />
      <DataTable
        columns={columns}
        data={rows}
        searchKey="user"
        searchPlaceholder="Search name or email…"
        facets={[
          { columnId: "department", title: "Department" },
          { columnId: "primary", title: "Primary role" },
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
