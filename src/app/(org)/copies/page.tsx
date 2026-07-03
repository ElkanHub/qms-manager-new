import Link from "next/link";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { SectionCard } from "@/components/app/section-card";
import { ModuleOffAlert } from "@/components/app/module-off-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Copy, Download, TriangleAlert } from "lucide-react";
import { columns, type CopyRow } from "./columns";
import { IssueCopyDialog } from "./issue-copy-dialog";
import { RequestCopyDialog } from "./request-copy-dialog";
import { RequestQueue, RequestStateBadge, type RequestRow } from "./request-queue";

// The copy register — ONE role-adaptive screen instead of five (UX: sections
// appear only when they have something to say; nothing is split for its own sake).
//
//   Everyone     → request a copy (the only way out), watch their own requests,
//                  see the copies their department holds and which are stale.
//   QA (issuer)  → the incoming request queue, the recall worklist, and the
//                  full register with export.
//
// One door out: documents leave the system as copies only through here, and
// only QA issues. Module off → nothing new leaves; the register stays readable
// and reconcilable (outstanding paper never orphans).
export default async function Copies() {
  const user = await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const supabase = await createClient();

  const { data: mod } = await supabase
    .from("tenant_modules")
    .select("enabled, config")
    .eq("module_key", "controlled_copies")
    .maybeSingle();
  const moduleOn = mod?.enabled ?? false;
  const cfg = (mod?.config ?? {}) as { formats?: string[]; allow_uncontrolled?: boolean };
  const formats = cfg.formats ?? ["paper", "pdf"];
  const allowUncontrolled = cfg.allow_uncontrolled !== false;

  const [{ data: register }, { data: requests }, { data: activeDocs }, { data: people }] =
    await Promise.all([
      supabase
        .from("copies_register")
        .select(
          "id, copy_number, holder, purpose, copy_type, format, request_id, issued_at, reconciled_note, live_state, revision_number, document_number, title",
        )
        .order("issued_at", { ascending: false }),
      supabase
        .from("copy_requests")
        .select(
          "id, document_id, requester_id, department_id, purpose, copy_type, format, destination, quantity, state, decline_reason, created_at",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("documents")
        .select("id, title, document_number, current_version_id")
        .eq("status", "active")
        .order("document_number"),
      supabase.from("users").select("id, email"),
    ]);

  const emailOf = (id: string) => people?.find((p) => p.id === id)?.email ?? "—";
  const docLabel = (id: string) => {
    const d = activeDocs?.find((x) => x.id === id);
    return d ? `${d.document_number ?? "—"} · ${d.title}` : id.slice(0, 8);
  };

  const rows: CopyRow[] = (register ?? []).map((c) => ({
    id: c.id,
    copyNumber: `#${c.copy_number}`,
    document: `${c.document_number ?? "—"} · ${c.title} · rev ${String(c.revision_number ?? 0).padStart(2, "0")}`,
    copyType: c.copy_type,
    format: c.format,
    holder: c.holder,
    purpose: c.purpose ?? null,
    issuedDate: c.issued_at ? new Date(c.issued_at).toLocaleDateString() : "—",
    liveState: c.live_state,
    note: c.reconciled_note ?? null,
    canReconcile: isQA && (c.live_state === "issued" || c.live_state === "superseded_unreconciled"),
  }));
  const recallCount = rows.filter((r) => r.liveState === "superseded_unreconciled").length;

  const pendingRequests: RequestRow[] = (requests ?? [])
    .filter((r) => r.state === "requested")
    .map((r) => ({
      id: r.id,
      document: docLabel(r.document_id),
      copyType: r.copy_type,
      format: r.format,
      destination: r.destination,
      quantity: r.quantity,
      purpose: r.purpose,
      requester: emailOf(r.requester_id),
      requestedAt: new Date(r.created_at).toLocaleDateString(),
    }));

  const myRequests = (requests ?? []).filter((r) => r.requester_id === user.id);
  const requestIdsOfMyDept = new Set(
    (requests ?? [])
      .filter((r) => r.department_id && r.department_id === user.department_id)
      .map((r) => r.id),
  );
  const deptRows = rows.filter((r) => {
    const reg = register?.find((c) => c.id === r.id);
    return reg?.request_id && requestIdsOfMyDept.has(reg.request_id);
  });

  const requestOptions = (activeDocs ?? []).map((d) => ({
    documentId: d.id,
    label: `${d.document_number ?? "—"} · ${d.title}`,
  }));
  const issueOptions = (activeDocs ?? [])
    .filter((d) => d.current_version_id)
    .map((d) => ({
      versionId: d.current_version_id!,
      label: `${d.document_number ?? "—"} · ${d.title}`,
    }));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title={isQA ? "Copy register" : "Document copies"}
        description={
          isQA
            ? "Every copy that has ever left the system — who requested it, who issued it, and how it was accounted for."
            : "Copies leave the system only through QA. Request one here and track its status."
        }
        actions={
          <div className="flex items-center gap-2">
            {isQA && rows.length > 0 && (
              <Button variant="outline" asChild>
                <Link href="/copies/export">
                  <Download />
                  Export register
                </Link>
              </Button>
            )}
            {moduleOn && (
              <RequestCopyDialog
                options={requestOptions}
                formats={formats}
                allowUncontrolled={allowUncontrolled}
              />
            )}
            {isQA && moduleOn && (
              <IssueCopyDialog
                options={issueOptions}
                formats={formats}
                allowUncontrolled={allowUncontrolled}
              />
            )}
          </div>
        }
      />

      {!moduleOn && (
        <ModuleOffAlert
          module="Controlled-copy register"
          detail="No new copies can be requested or issued while the module is off. Copies already on the register stay visible and can still be reconciled — outstanding paper is never orphaned."
        />
      )}

      {/* QA: the issuance queue — only exists while there's something to decide */}
      {isQA && pendingRequests.length > 0 && (
        <SectionCard
          title={`Requests awaiting decision (${pendingRequests.length})`}
          description="Issuing mints numbered register entries against the document's current effective revision."
        >
          <RequestQueue rows={pendingRequests} />
        </SectionCard>
      )}

      {/* QA: recall worklist */}
      {isQA && recallCount > 0 && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>
            {recallCount} {recallCount === 1 ? "copy is" : "copies are"} due for recall
          </AlertTitle>
          <AlertDescription>
            The revision they were issued against is no longer effective. Retrieve each copy and
            reconcile it below (returned / destroyed — or lost, with a documented note).
          </AlertDescription>
        </Alert>
      )}

      {/* Requester: my requests + my department's copies */}
      {!isQA && myRequests.length > 0 && (
        <SectionCard title="My requests">
          <ul className="divide-y">
            {myRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{docLabel(r.document_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.quantity} × {r.copy_type} ({r.format}) → {r.destination}
                  </p>
                </div>
                <RequestStateBadge state={r.state} reason={r.decline_reason} />
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {!isQA && deptRows.some((r) => r.liveState === "superseded_unreconciled") && (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>Your department holds copies of a superseded revision</AlertTitle>
          <AlertDescription>
            Return them to QA — the current revision is served in the app.
          </AlertDescription>
        </Alert>
      )}

      {/* The register: QA sees everything; a department sees what it holds */}
      <DataTable
        columns={columns}
        data={isQA ? rows : deptRows}
        facets={[
          { columnId: "copyType", title: "Type" },
          { columnId: "liveState", title: "Status" },
        ]}
        emptyState={
          <EmptyState
            icon={Copy}
            message={
              isQA
                ? "Nothing has left the system yet — issued copies will appear here."
                : "Your department holds no issued copies. Use Request a copy when you need one."
            }
          />
        }
      />
    </div>
  );
}
