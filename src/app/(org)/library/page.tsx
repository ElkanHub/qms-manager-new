import Link from "next/link";
import { Star } from "lucide-react";
import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { ModuleOffAlert } from "@/components/app/module-off-alert";
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
  const { q, category } = await searchParams;
  const supabase = await createClient();

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

  const { data: favs } = await supabase.from("document_favorites").select("document_id");
  const favSet = new Set((favs ?? []).map((f) => f.document_id));

  const rows: LibraryRow[] = (docs ?? [])
    .map((d) => ({
      id: d.id,
      number: d.document_number ?? "—",
      title: d.title,
      category: d.category ?? "—",
      status: "active",
      isFavorite: favSet.has(d.id),
    }))
    // Favorited documents float to the top.
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="SOP Library"
        description="Your department's working view"
        actions={
          <Button asChild>
            <Link href="/library/master">Master Index</Link>
          </Button>
        }
      />
      {!libraryOn && (
        <ModuleOffAlert
          module="SOP Library"
          detail="Showing a plain fallback list — reading is unaffected."
        />
      )}
      <DataTable
        columns={columns}
        data={rows}
        searchKey="document"
        searchPlaceholder="Search number or title…"
        facets={[{ columnId: "category", title: "Category" }]}
        onRowHref={(r) => `/documents/${r.id}`}
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
