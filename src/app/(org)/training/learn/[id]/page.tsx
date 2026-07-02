import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LearnClient } from "./learn-client";

// T-LEARN (plan §10): slides with a progress bar → assessment → score →
// certificate. Content arrives through the single audited door
// (get_training_content); questions are fetched separately, stripped of
// answers, only once the slides are done.
export default async function Learn({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOrgUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_training_content", { p_assignment: id });

  if (error || !data) {
    return (
      <main className="mx-auto max-w-2xl p-2">
        <p className="text-sm text-muted-foreground">
          {error?.message ?? "Training not available."}
        </p>
      </main>
    );
  }

  const { data: cert } = await supabase
    .from("certificates")
    .select("certificate_uid, score, issued_at")
    .eq("assignment_id", id)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-2xl p-2">
      <LearnClient content={data} certificate={cert ?? null} />
    </main>
  );
}
