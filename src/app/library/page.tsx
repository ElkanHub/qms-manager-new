import Link from "next/link";
import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toggleFavorite } from "./actions";

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
  const categories = [...new Set((docs ?? []).map((d) => d.category).filter(Boolean))];

  return (
    <main className="mx-auto max-w-3xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">SOP Library</h1>
        <Link href="/library/master" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Master Index
        </Link>
      </div>
      {!libraryOn && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Library module is off — showing a plain fallback list. Reading is unaffected.
        </p>
      )}

      <form className="mt-4 flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={q} placeholder="Search title or number…"
          className="rounded-md border border-neutral-300 px-3 py-1.5" />
        {categories.length > 0 && (
          <select name="category" defaultValue={category} className="rounded-md border border-neutral-300 px-3 py-1.5">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c!}>{c}</option>)}
          </select>
        )}
        <button className="rounded-md bg-neutral-100 px-3 py-1.5 font-medium">Filter</button>
      </form>

      <ul className="mt-4 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {(docs ?? []).map((d) => (
          <li key={d.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <Link href={`/documents/${d.id}`} className="hover:underline">
              <span className="text-neutral-500">{d.document_number ?? "—"}</span>{" "}
              <span className="font-medium">{d.title}</span>
            </Link>
            <form action={toggleFavorite}>
              <input type="hidden" name="document_id" value={d.id} />
              <button className="text-xs">{favSet.has(d.id) ? "★" : "☆"}</button>
            </form>
          </li>
        ))}
        {!docs?.length && <li className="px-4 py-3 text-sm text-neutral-500">No documents in your department yet.</li>}
      </ul>
    </main>
  );
}
