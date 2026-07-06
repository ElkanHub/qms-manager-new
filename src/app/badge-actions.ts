"use server";

import { getQueueCounts } from "@/lib/queue-counts";

// Client-callable counts for the live sidebar badges. Same RLS-scoped helper
// the layout uses server-side — a non-QA/HOD caller simply gets zeros for the
// queues they can't see (and those nav items are hidden anyway).
export async function fetchQueueCounts(): Promise<Record<string, number>> {
  return getQueueCounts();
}
