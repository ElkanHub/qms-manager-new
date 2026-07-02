import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Shared RLS-scoped queue counts for the sidebar badges (UI_BUILD_PLAN §4.2).
// Same filters the queue pages use; counts are head-only. RLS scopes rows to the
// caller, so a non-QA/HOD user simply sees zeros (and those nav items are hidden).
// "Actionable now" for destruction/periodic = past retention / overdue.
export const getQueueCounts = cache(async (): Promise<Record<string, number>> => {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [endorse, qaReview, retirements, destruction, periodic] = await Promise.all([
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
  ]);

  return {
    endorse: endorse.count ?? 0,
    qaReview: qaReview.count ?? 0,
    retirements: retirements.count ?? 0,
    destruction: destruction.count ?? 0,
    periodic: periodic.count ?? 0,
  };
});
