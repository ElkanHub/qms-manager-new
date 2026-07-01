import Link from "next/link";
import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// D-MASTER-INDEX — the tenant-wide, unscoped, filterable list of ALL effective SOPs.
// Any effective SOP is openable for full read company-wide (A.4) — cross-department
// reference is the point. Lists only effective versions (never in-flight).
export default async function MasterIndex({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; dept?: string }>;
}) {
  await requireOrgUser();
  const { q, dept } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("documents")
    .select("id, document_number, title, department_id, current_version_id")
    .eq("status", "active")
    .order("document_number");
  if (q) query = query.or(`title.ilike.%${q}%,document_number.ilike.%${q}%`);
  if (dept) query = query.eq("department_id", dept);
  const { data: docs } = await query;

  const { data: departments } = await supabase.from("departments").select("id, name").order("name");
  const nameOf = (id: string | null) => departments?.find((d) => d.id === id)?.name ?? "—";

  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Master Index</h1>
        <Link href="/library" className="text-sm underline">← Working view</Link>
      </div>
      <p className="mt-1 text-sm text-neutral-600">Every effective SOP, company-wide. Open any for full read.</p>

      <form className="mt-4 flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={q} placeholder="Search number or title…"
          className="rounded-md border border-neutral-300 px-3 py-1.5" />
        <select name="dept" defaultValue={dept} className="rounded-md border border-neutral-300 px-3 py-1.5">
          <option value="">All departments</option>
          {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className="rounded-md bg-neutral-100 px-3 py-1.5 font-medium">Filter</button>
      </form>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500">
            <th className="py-2">Number</th><th>Title</th><th>Department</th>
          </tr>
        </thead>
        <tbody>
          {(docs ?? []).map((d) => (
            <tr key={d.id} className="border-b border-neutral-100">
              <td className="py-2">{d.document_number ?? "—"}</td>
              <td><Link href={`/documents/${d.id}`} className="font-medium hover:underline">{d.title}</Link></td>
              <td>{nameOf(d.department_id)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!docs?.length && <p className="mt-4 text-sm text-neutral-500">No effective documents yet.</p>}
    </main>
  );
}
