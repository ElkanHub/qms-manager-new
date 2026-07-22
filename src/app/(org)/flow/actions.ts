"use server";

import { createClient } from "@/lib/supabase/server";

// The Flow Map's single action: inspect one SOP's live position. The RPC is
// SECURITY DEFINER — it enforces module-enabled + QA/admin authority and records
// the inspection on the audit chain (rule 0.3); this just relays the result.
export type FlowInspect = {
  document_number: string | null;
  title: string;
  doc_status: string;
  version_status: string | null;
  revision: number | null;
  cc_status: string | null;
  cc_id: string | null;
};

type Result = { ok: true; data: FlowInspect } | { ok: false; error: string };

export async function inspectFlow(documentId: string): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("flow_inspect", { p_document: documentId });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "No such document." };
  return { ok: true, data: row as FlowInspect };
}
