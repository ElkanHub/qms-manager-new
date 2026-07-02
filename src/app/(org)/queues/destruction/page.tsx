import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { DataTable } from "@/components/app/data-table";
import { columns, type DestructionRow } from "./columns";
import { Flame } from "lucide-react";

// D-DESTRUCTION — the time-gated destruction queue. Lists retained versions whose
// retention has elapsed (from supersession OR retirement). The time-gate is enforced
// server-side regardless of role; this page only surfaces the state.

// Native relative time — "4 years ago" / "in 3 years". No dep.
function relTime(target: number, now: number): string {
  const diff = target - now;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const year = 31_536_000_000,
    month = 2_592_000_000,
    day = 86_400_000;
  const abs = Math.abs(diff);
  if (abs >= year) return rtf.format(Math.round(diff / year), "year");
  if (abs >= month) return rtf.format(Math.round(diff / month), "month");
  return rtf.format(Math.round(diff / day), "day");
}

export default async function Destruction() {
  await requireOrgUser();
  const supabase = await createClient();

  const [{ data: versions }, { data: docs }, { data: settings }] = await Promise.all([
    supabase
      .from("document_versions")
      .select("id, document_id, revision_number, retention_until, status")
      .eq("status", "retained")
      .order("retention_until", { ascending: true }),
    supabase.from("documents").select("id, title, document_number"),
    // The retention window value (default 60 months) anchors the progress bar's start.
    supabase.from("retention_settings").select("months").maybeSingle(),
  ]);

  const now = Date.now();
  const windowMs = (settings?.months ?? 60) * 2_592_000_000;

  const rows: DestructionRow[] = (versions ?? []).map((v) => {
    const d = docs?.find((x) => x.id === v.document_id);
    const number = d?.document_number ?? "—";
    const until = v.retention_until ? new Date(v.retention_until).getTime() : null;
    const date = until ? new Date(until).toISOString().slice(0, 10) : "—";
    const unlocked = until != null && until <= now;
    // elapsed fraction over the retention window (start = until - window).
    const progress = until
      ? Math.max(0, Math.min(100, ((now - (until - windowMs)) / windowMs) * 100))
      : 0;
    const rel = until ? relTime(until, now) : "—";
    return {
      id: v.id,
      number,
      title: d?.title ?? "—",
      revision: String(v.revision_number ?? 0).padStart(2, "0"),
      retentionDate: date,
      relLabel: rel,
      progress,
      unlocked,
      retentionNote: `Retention elapsed ${date} · ${rel}`,
      unlockLabel: `Unlocks ${date} (${rel})`,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-2">
      <PageHeader
        title="Destruction"
        description="Records that have reached retention expiry and may be destroyed."
      />
      <DataTable
        columns={columns}
        data={rows}
        searchKey="document"
        searchPlaceholder="Search number or title…"
        emptyState={
          <EmptyState
            icon={Flame}
            message="Nothing reaches retention expiry for years — this queue is expected to be empty."
          />
        }
      />
    </div>
  );
}
