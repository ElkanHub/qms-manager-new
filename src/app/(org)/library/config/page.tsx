import { redirect } from "next/navigation";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { SectionCard } from "@/components/app/section-card";
import { CategoriesManager, AccessQueue, ActiveGrants, LockedDocs } from "./config-client";

// L-CONFIG — one screen for everything QA runs the library with: the category
// taxonomy, the access-request queue for restricted documents, active timed
// grants, and the list of locked documents. Sections only render when they
// have content (UX rule: no dead panels).
export default async function LibraryConfig() {
  await requireOrgUser();
  const roles = await getMyRoles();
  if (!roles.includes("qa") && !roles.includes("org_admin")) redirect("/library");
  const isQA = roles.includes("qa");
  const supabase = await createClient();

  const [{ data: cats }, { data: requests }, { data: locks }, { data: docs }, { data: users }] =
    await Promise.all([
      supabase.from("library_categories").select("id, name, sort_order").order("sort_order"),
      supabase
        .from("read_access_requests")
        .select("id, document_id, requester_id, purpose, state, expires_at, created_at")
        .in("state", ["requested", "granted"])
        .order("created_at"),
      supabase.from("document_locks").select("document_id, reason, locked_at"),
      supabase.from("documents").select("id, document_number, title"),
      supabase.from("users").select("id, email"),
    ]);

  const docLabel = (id: string) => {
    const d = docs?.find((x) => x.id === id);
    return d ? `${d.document_number ?? "—"} · ${d.title}` : id.slice(0, 8);
  };
  const emailOf = (id: string) => users?.find((u) => u.id === id)?.email ?? "—";

  const pending = (requests ?? [])
    .filter((r) => r.state === "requested")
    .map((r) => ({
      id: r.id,
      document: docLabel(r.document_id),
      requester: emailOf(r.requester_id),
      purpose: r.purpose,
      at: new Date(r.created_at).toLocaleDateString(),
    }));
  const grants = (requests ?? [])
    .filter((r) => r.state === "granted" && r.expires_at && new Date(r.expires_at) > new Date())
    .map((r) => ({
      id: r.id,
      document: docLabel(r.document_id),
      requester: emailOf(r.requester_id),
      until: new Date(r.expires_at!).toLocaleString(),
    }));
  const lockedDocs = (locks ?? []).map((l) => ({
    documentId: l.document_id,
    document: docLabel(l.document_id),
    reason: l.reason,
    since: new Date(l.locked_at).toLocaleDateString(),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2">
      <PageHeader
        title="Library setup"
        description="Categories organize the library; locks restrict individual documents. Every lock, request, grant, and read is on the audit trail."
      />

      {isQA && pending.length > 0 && (
        <SectionCard
          title={`Access requests (${pending.length})`}
          description="Grants carry a time limit — when it passes, access closes by itself."
        >
          <AccessQueue rows={pending} />
        </SectionCard>
      )}

      {isQA && grants.length > 0 && (
        <SectionCard title="Active grants">
          <ActiveGrants rows={grants} />
        </SectionCard>
      )}

      {isQA && lockedDocs.length > 0 && (
        <SectionCard title="Restricted documents">
          <LockedDocs rows={lockedDocs} />
        </SectionCard>
      )}

      <SectionCard
        title="Categories"
        description="Your organization's taxonomy — documents are assigned from their read page."
      >
        <CategoriesManager
          categories={(cats ?? []).map((c) => ({ id: c.id, name: c.name, sort: c.sort_order }))}
        />
      </SectionCard>
    </div>
  );
}
