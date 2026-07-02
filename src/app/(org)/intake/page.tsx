import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IntakeFlow } from "./IntakeFlow";

// D-INTAKE — "Start a request". The single easy surface over the strict engine.
export default async function Intake() {
  await requireOrgUser();
  const supabase = await createClient();
  const { data: docs } = await supabase
    .from("documents")
    .select("id, document_number, title")
    .eq("status", "active")
    .order("document_number");
  const effectiveDocs = (docs ?? []).map((d) => ({
    id: d.id,
    label: `${d.document_number ?? "—"} · ${d.title}`,
  }));

  return (
    <div className="mx-auto max-w-lg space-y-6 p-2">
      <div>
        <h1 className="text-2xl font-semibold">Start a request</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One door. Tell us what you want to do; the system figures out the type and routes it.
        </p>
      </div>
      <IntakeFlow effectiveDocs={effectiveDocs} />
    </div>
  );
}
