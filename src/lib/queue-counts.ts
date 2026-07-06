import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Shared RLS-scoped queue counts for the sidebar badges (UI_BUILD_PLAN §4.2).
// Same filters the queue pages use; counts are head-only. RLS scopes rows to the
// caller, so a non-QA/HOD user simply sees zeros (and those nav items are hidden).
// "Actionable now" for destruction/periodic = past retention / overdue.
export const getQueueCounts = cache(async (): Promise<Record<string, number>> => {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id ?? "00000000-0000-0000-0000-000000000000";

  const [endorse, qaReview, retirements, destruction, periodic, training, copies] = await Promise.all([
    supabase
      .from("approval_requests")
      .select("*", { count: "exact", head: true })
      .eq("stage", "hod_review")
      .eq("status", "pending"),
    supabase
      .from("approval_requests")
      .select("*", { count: "exact", head: true })
      .eq("stage", "qa_review")
      .eq("status", "pending"),
    supabase
      .from("retirements")
      .select("*", { count: "exact", head: true })
      .in("status", ["retirement_requested", "retirement_approved"]),
    supabase
      .from("document_versions")
      .select("*", { count: "exact", head: true })
      .eq("status", "retained")
      .lte("retention_until", nowIso),
    supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .lte("next_review_at", nowIso),
    // Personal: MY open training (assignments are tenant-readable, so filter to me).
    supabase
      .from("training_assignments")
      .select("*", { count: "exact", head: true })
      .eq("user_id", me)
      .neq("status", "completed"),
    // Copies needing recall — issued controlled/display copies of a no-longer-effective version.
    supabase
      .from("copies_recall_due")
      .select("*", { count: "exact", head: true }),
  ]);

  return {
    endorse: endorse.count ?? 0,
    qaReview: qaReview.count ?? 0,
    retirements: retirements.count ?? 0,
    destruction: destruction.count ?? 0,
    periodic: periodic.count ?? 0,
    training: training.count ?? 0,
    copies: copies.count ?? 0,
  };
});
