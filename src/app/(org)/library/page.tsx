import Link from "next/link";
import { FilePenLine, Star } from "lucide-react";
import { requireOrgUser, getMyRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { ModuleOffAlert } from "@/components/app/module-off-alert";
import { RoleGate } from "@/components/app/role-gate";
import { SectionCard } from "@/components/app/section-card";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { columns, type LibraryRow } from "./columns";

// D-LIBRARY — the department-scoped working view over the core read surface. The
// department filter is an organizing convenience, NOT a read wall (A.4): the Master
// Index reaches everything. If the Library module is off, this still works as a plain
// list (reading never breaks — the effective-only listing is enforced by RLS).
export default async function Library({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const user = await requireOrgUser();
  const isQA = (await getMyRoles()).includes("qa");
  const { q, category } = await searchParams;
  const supabase = await createClient();

  // In-flight work: documents that exist but are NOT effective yet (a fresh
  // upload from intake lands here as a draft). Owners see their own; QA sees
  // everything in flight. Each row links to its actual next step.
  let inflightQuery = supabase
    .from("documents")
    .select("id, document_number, title, status, updated_at, owner_id")
    .in("status", ["draft", "in_review", "pending_training", "scheduled"])
    .order("updated_at", { ascending: false })
    .limit(15);
  if (!isQA) inflightQuery = inflightQuery.eq("owner_id", user.id);
  const { data: inflight } = await inflightQuery;

  const { data: mod } = await supabase
    .from("tenant_modules")
    .select("enabled")
    .eq("module_key", "library")
    .maybeSingle();
  const libraryOn = mod?.enabled ?? false;

  let query = supabase
    .from("documents")
    .select("id, document_number, title, category, department_id")
    .eq("status", "active")
    .eq("department_id", user.department_id ?? "")
    .order("document_number");
  if (q) query = query.or(`title.ilike.%${q}%,document_number.ilike.%${q}%`);
  if (category) query = query.eq("category", category);
  const { data: docs } = await query;

  const [{ data: favs }, { data: cats }, { data: docCats }, { data: locks }] = await Promise.all([
    supabase.from("document_favorites").select("document_id"),
    supabase.from("library_categories").select("id, name").order("sort_order"),
    supabase.from("document_categories").select("document_id, category_id"),
    supabase.from("document_locks").select("document_id"),
  ]);
  const favSet = new Set((favs ?? []).map((f) => f.document_id));
  const lockSet = new Set((locks ?? []).map((l) => l.document_id));
  const catName = (cid: string) => cats?.find((c) => c.id === cid)?.name;
  const categoriesOf = (docId: string) =>
    (docCats ?? [])
      .filter((dc) => dc.document_id === docId)
      .map((dc) => catName(dc.category_id))
      .filter(Boolean) as string[];

  const rows: LibraryRow[] = (docs ?? [])
    .map((d) => ({
      id: d.id,
      number: d.document_number ?? "—",
      title: d.title,
      category: categoriesOf(d.id).join(", ") || (d.category ?? "—"),
      status: "active",
      isFavorite: favSet.has(d.id),
      isLocked: lockSet.has(d.id),
    }))
    // Favorited documents float to the top.
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="SOP Library"
        description="Your department's working view"
        actions={
          <div className="flex items-center gap-2">
            <RoleGate anyOf={["qa", "org_admin"]}>
              <Button variant="outline" asChild>
                <Link href="/library/config">Library setup</Link>
              </Button>
            </RoleGate>
            <Button asChild>
              <Link href="/library/master">Master Index</Link>
            </Button>
          </div>
        }
      />
      {!libraryOn && (
        <ModuleOffAlert
          module="SOP Library"
          detail="Showing a plain fallback list — reading is unaffected."
        />
      )}

      {(inflight ?? []).length > 0 && (
        <SectionCard
          title="In-flight documents"
          description={
            isQA
              ? "Everything not yet effective — drafts to finish, reviews in progress, training and scheduled releases."
              : "Your documents that aren't effective yet. A draft needs you: open it and submit it for review."
          }
        >
          <ul className="divide-y">
            {(inflight ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.document_number ?? "—"} · updated{" "}
                    {new Date(d.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge value={d.status} />
                  {d.status === "draft" ? (
                    <Button size="sm" asChild>
                      <Link href={`/documents/${d.id}/draft`}>
                        <FilePenLine aria-hidden />
                        Continue draft
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/documents/${d.id}/history`}>Track</Link>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <DataTable
        columns={columns}
        data={rows}
        searchKey="document"
        searchPlaceholder="Search number or title…"
        facets={[{ columnId: "category", title: "Category" }]}
        rowHrefBase="/documents"
        emptyState={
          <EmptyState
            icon={Star}
            message="No documents in your department yet — effective documents from your department appear here."
          />
        }
      />
    </div>
  );
}
