import Link from "next/link";
import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// D-CHANGE list — open change controls (RLS-scoped to requester/QA). Opens the
// workstation for each.
export default async function Changes() {
  await requireOrgUser();
  const supabase = await createClient();
  const { data: changes } = await supabase
    .from("change_controls")
    .select("id, type, classification, status, reason, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Change controls</h1>
      <ul className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {(changes ?? []).map((c) => (
          <li key={c.id} className="px-4 py-3 text-sm">
            <Link href={`/changes/${c.id}`} className="flex items-center justify-between hover:underline">
              <span>
                <span className="font-medium">{c.type}</span>
                {c.classification && <span className="ml-2 text-neutral-500">{c.classification}</span>}
                <span className="ml-2 text-neutral-500">{c.reason}</span>
              </span>
              <span className="text-xs uppercase text-neutral-500">{c.status}</span>
            </Link>
          </li>
        ))}
        {!changes?.length && <li className="px-4 py-3 text-sm text-neutral-500">No change controls yet — start one from intake.</li>}
      </ul>
    </main>
  );
}
