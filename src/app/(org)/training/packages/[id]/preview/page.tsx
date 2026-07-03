import { requireOrgUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LearnClient } from "../../../learn/[id]/learn-client";

// Trainer preview (plan §10 review polish): exactly what a trainee will see,
// with nothing recorded — served by get_package_preview (trainer/QA only).
export default async function PackagePreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOrgUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_package_preview", { p_package: id });

  if (error || !data) {
    return (
      <main className="mx-auto max-w-2xl p-2">
        <p className="text-sm text-muted-foreground">{error?.message ?? "Preview not available."}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-2">
      <LearnClient content={data} certificate={null} preview />
    </main>
  );
}
