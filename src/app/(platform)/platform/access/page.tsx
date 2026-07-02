import { requirePlatformUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KeyRound } from "lucide-react";
import { RequestForm, Countdown, CloseButton } from "./access-client";

// S-ACCESS-GATE — where a platform admin requests bounded access to a tenant's data.
// Shows each tenant's configured mode. In consent mode the request waits for QA; in
// self-authorized mode it opens immediately. Everything done during an open session
// is captured on the tenant's audit trail.
export default async function AccessGate() {
  const me = await requirePlatformUser();
  const admin = createAdminClient();
  const { data: tenants } = await admin.from("tenants").select("id, name").order("name");
  const { data: configs } = await admin.from("tenant_gate_config").select("tenant_id, mode");
  const { data: myRequests } = await admin
    .from("access_requests")
    .select("id, tenant_id, purpose, status, mode, expires_at")
    .eq("requested_by", me.id)
    .order("requested_at", { ascending: false });
  const modeOf = (id: string) => configs?.find((c) => c.tenant_id === id)?.mode ?? "org_approved";
  const nameOf = (id: string) => tenants?.find((t) => t.id === id)?.name ?? id;

  const tenantOptions = (tenants ?? []).map((t) => ({ id: t.id, name: t.name, mode: modeOf(t.id) }));
  const requests = myRequests ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Break-glass access"
        description="Request bounded, audited access to a tenant's data."
      />

      <SectionCard title="Request access">
        <RequestForm tenants={tenantOptions} />
      </SectionCard>

      <SectionCard
        title="Your sessions"
        description="Requests you've raised. Open sessions show the time remaining before they auto-expire."
      >
        {requests.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            message="You haven't requested access to any tenant yet. Raise a request above to begin."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires in</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{nameOf(r.tenant_id)}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{r.purpose}</TableCell>
                  <TableCell>
                    <StatusBadge value={r.status} dot />
                  </TableCell>
                  <TableCell>
                    {r.status === "open" && r.expires_at ? (
                      <Countdown expiresAt={r.expires_at} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "open" && <CloseButton requestId={r.id} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
