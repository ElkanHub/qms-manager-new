import { Building2 } from "lucide-react";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
import { CreateDepartmentDialog } from "./create-department-dialog";
import { HodSelect } from "./hod-select";

// S-DEPARTMENTS — QA creates departments (QA exists as default) and assigns HODs.
export default async function Departments() {
  await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();
  const { data: departments } = await supabase.from("departments").select("*").order("name");
  const { data: users } = await supabase
    .from("users")
    .select("id, email, full_name")
    .eq("status", "active");

  const userOptions = (users ?? []).map((u) => ({ id: u.id, label: u.full_name ?? u.email }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Departments"
        description="Departments organize documents and route endorsement."
        actions={isQA ? <CreateDepartmentDialog /> : undefined}
      />

      {(departments ?? []).length === 0 ? (
        <EmptyState
          icon={Building2}
          message="No departments yet — create one to organize documents and endorsement."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>Head of department</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(departments ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="py-2.5">
                    <span className="flex items-center gap-2 font-medium">
                      {d.name}
                      {d.is_default && <Badge variant="outline">org root</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5">
                    {isQA ? (
                      <HodSelect departmentId={d.id} users={userOptions} />
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isQA && (
        <p className="text-sm text-muted-foreground">
          Only QA can create departments or assign HODs.
        </p>
      )}
    </div>
  );
}
