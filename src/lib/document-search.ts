"use server";

import { createClient } from "@/lib/supabase/server";

// Server-backed document search for the ⌘K palette and breadcrumb labels
// (UI_BUILD_PLAN §10.2 — replaces the 500-document layout preload). RLS scopes
// every query to the caller's tenant; only effective (active) documents match.

export type DocHit = { id: string; number: string; title: string };

export async function searchDocuments(q: string): Promise<DocHit[]> {
  // PostgREST .or() treats commas/parens/quotes as syntax — drop them from the
  // needle (they never disambiguate a title match anyway).
  const needle = q.trim().replace(/[(),"\\]/g, " ").replace(/\s+/g, " ").trim();
  if (needle.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("id, document_number, title")
    .eq("status", "active")
    .or(`title.ilike.%${needle}%,document_number.ilike.%${needle}%`)
    .order("document_number")
    .limit(20);
  return (data ?? []).map((d) => ({
    id: d.id as string,
    number: (d.document_number as string | null) ?? "—",
    title: d.title as string,
  }));
}

export async function getDocumentLabel(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("document_number, title")
    .eq("id", id)
    .maybeSingle();
  return data ? `${data.document_number ?? "—"} · ${data.title}` : null;
}
