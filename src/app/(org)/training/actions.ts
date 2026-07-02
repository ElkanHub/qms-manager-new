"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  GatewayError,
  generateSingleQuestion,
  generateTrainingPackage,
  type GatewayConfig,
} from "@/lib/ai/gateway";

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function gatewayConfig(): Promise<GatewayConfig> {
  const supabase = await createClient();
  const { data } = await supabase.from("ai_gateway_config").select("provider, model, settings").maybeSingle();
  return {
    provider: data?.provider ?? "gemini",
    model: data?.model ?? "gemini-2.5-flash",
    settings: (data?.settings as Record<string, unknown>) ?? {},
  };
}

// T-PACKAGES: create the package, run the gateway, land the draft. AI failure
// never dead-ends (plan §3.5): the package drops to draft review for manual
// authoring or retry, with the failure on the provenance log.
export async function generatePackage(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const sourceText = String(formData.get("source_text") || "").trim();
  if (sourceText.length < 100) {
    return { ok: false, error: "Paste the document's content (at least a few paragraphs) — slides and questions are generated strictly from it." };
  }
  const passMarkRaw = String(formData.get("pass_mark") || "").trim();
  const { data: packageId, error } = await supabase.rpc("create_training_package", {
    p_version: String(formData.get("version_id")),
    p_template: String(formData.get("template_key")),
    p_question_count: Number(formData.get("question_count") || 5),
    p_pass_mark: passMarkRaw ? Number(passMarkRaw) : null,
  });
  if (error) return { ok: false, error: error.message };

  const config = await gatewayConfig();
  try {
    const generated = await generateTrainingPackage(config, {
      document: {
        number: String(formData.get("doc_number") || "") || null,
        title: String(formData.get("doc_title") || ""),
        revision: formData.get("revision") ? Number(formData.get("revision")) : null,
      },
      sourceText,
      reasonForChange: String(formData.get("reason_for_change") || "") || null,
      templateKey: String(formData.get("template_key")),
      questionCount: Number(formData.get("question_count") || 5),
    });
    const { error: storeError } = await supabase.rpc("store_ai_draft", {
      p_package: packageId,
      p_slides: generated.slides,
      p_questions: generated.questions,
      p_provider: config.provider,
      p_model: config.model,
      p_source_text: sourceText,
    });
    if (storeError) return { ok: false, error: storeError.message };
  } catch (e) {
    const message = e instanceof GatewayError ? e.message : String(e);
    await supabase.rpc("log_ai_failure", {
      p_package: packageId,
      p_provider: config.provider,
      p_model: config.model,
      p_error: message.slice(0, 500),
    });
    // Store the grounding text so manual authoring / retry keeps provenance.
    revalidatePath("/training/packages");
    return {
      ok: false,
      error: `AI generation failed (${message.slice(0, 200)}). The package was created — open it to author the content manually, or retry generation.`,
    };
  }
  revalidatePath("/training/packages");
  redirect(`/training/packages/${packageId}`);
}

// Retry generation on an existing draft (uses the stored grounding text).
export async function regeneratePackage(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const packageId = String(formData.get("package_id"));
  const { data: pkg } = await supabase
    .from("training_packages")
    .select("source_text, template_key, question_count, document_id, document_version_id")
    .eq("id", packageId)
    .maybeSingle();
  const sourceText = String(formData.get("source_text") || pkg?.source_text || "").trim();
  if (sourceText.length < 100) {
    return { ok: false, error: "No grounding text available — paste the document content to regenerate." };
  }
  const { data: doc } = await supabase
    .from("documents")
    .select("document_number, title")
    .eq("id", pkg?.document_id ?? "")
    .maybeSingle();

  const config = await gatewayConfig();
  try {
    const generated = await generateTrainingPackage(config, {
      document: { number: doc?.document_number ?? null, title: doc?.title ?? "", revision: null },
      sourceText,
      templateKey: pkg?.template_key ?? "clean-corporate",
      questionCount: pkg?.question_count ?? 5,
    });
    const { error } = await supabase.rpc("store_ai_draft", {
      p_package: packageId,
      p_slides: generated.slides,
      p_questions: generated.questions,
      p_provider: config.provider,
      p_model: config.model,
      p_source_text: sourceText,
    });
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    const message = e instanceof GatewayError ? e.message : String(e);
    await supabase.rpc("log_ai_failure", {
      p_package: packageId, p_provider: config.provider, p_model: config.model,
      p_error: message.slice(0, 500),
    });
    return { ok: false, error: `AI generation failed: ${message.slice(0, 200)}` };
  }
  revalidatePath(`/training/packages/${packageId}`);
  return { ok: true, message: "Draft regenerated — the previous draft was replaced." };
}

export async function regenerateQuestion(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const packageId = String(formData.get("package_id"));
  const questionId = String(formData.get("question_id"));
  const { data: pkg } = await supabase
    .from("training_packages")
    .select("source_text, template_key, document_id")
    .eq("id", packageId)
    .maybeSingle();
  if (!pkg?.source_text) {
    return { ok: false, error: "No grounding text stored on this package — regenerate the whole draft instead." };
  }
  const { data: doc } = await supabase
    .from("documents").select("document_number, title").eq("id", pkg.document_id).maybeSingle();
  const config = await gatewayConfig();
  try {
    const q = await generateSingleQuestion(config, {
      document: { number: doc?.document_number ?? null, title: doc?.title ?? "", revision: null },
      sourceText: pkg.source_text,
      templateKey: pkg.template_key,
      questionCount: 1,
    });
    const { error } = await supabase.rpc("update_training_question", {
      p_question: questionId,
      p_text: q.question,
      p_options: q.options,
      p_correct_index: q.correct_index,
      p_explanation: q.explanation ?? null,
    });
    if (error) return { ok: false, error: error.message };
    await supabase.rpc("log_ai_call", {
      p_package: packageId, p_operation: "regenerate_question",
      p_provider: config.provider, p_model: config.model, p_output_ref: questionId,
    });
  } catch (e) {
    return { ok: false, error: e instanceof GatewayError ? e.message : String(e) };
  }
  revalidatePath(`/training/packages/${packageId}`);
  return { ok: true, message: "Question regenerated from the document." };
}

// ---- T-REVIEW edits (all guarded server-side to draft_review) ----
export async function updateSlide(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_training_slide", {
    p_slide: String(formData.get("slide_id")),
    p_title: String(formData.get("title") || ""),
    p_body: String(formData.get("body") || ""),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/training/packages/${formData.get("package_id")}`);
  return { ok: true };
}

export async function addSlide(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_training_slide", {
    p_package: String(formData.get("package_id")),
    p_title: String(formData.get("title") || "New slide"),
    p_body: String(formData.get("body") || ""),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/training/packages/${formData.get("package_id")}`);
  return { ok: true };
}

export async function deleteSlide(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_training_slide", {
    p_slide: String(formData.get("slide_id")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/training/packages/${formData.get("package_id")}`);
  return { ok: true };
}

export async function reorderSlides(packageId: string, order: string[]): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_training_slides", {
    p_package: packageId,
    p_order: order,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/training/packages/${packageId}`);
  return { ok: true };
}

export async function updateQuestion(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const options = formData.getAll("options").map(String).filter((o) => o.trim().length > 0);
  const { error } = await supabase.rpc("update_training_question", {
    p_question: String(formData.get("question_id")),
    p_text: String(formData.get("question") || ""),
    p_options: options,
    p_correct_index: Number(formData.get("correct_index") || 0),
    p_explanation: String(formData.get("explanation") || "") || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/training/packages/${formData.get("package_id")}`);
  return { ok: true };
}

export async function addQuestion(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_training_question", {
    p_package: String(formData.get("package_id")),
    p_text: String(formData.get("question") || "New question"),
    p_options: ["Option A", "Option B"],
    p_correct_index: 0,
    p_explanation: null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/training/packages/${formData.get("package_id")}`);
  return { ok: true };
}

export async function deleteQuestion(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_training_question", {
    p_question: String(formData.get("question_id")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/training/packages/${formData.get("package_id")}`);
  return { ok: true };
}

export async function reorderQuestions(packageId: string, order: string[]): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_training_questions", {
    p_package: packageId,
    p_order: order,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/training/packages/${packageId}`);
  return { ok: true };
}

// ---- Lifecycle ----
export async function approvePackage(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_training_package", {
    p_package: String(formData.get("package_id")),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/training/packages");
  return { ok: true, message: "Package approved — it can now be assigned." };
}

export async function closePackage(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_training_package", {
    p_package: String(formData.get("package_id")),
    p_reason: String(formData.get("reason") || ""),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/training/packages");
  return { ok: true, message: "Package closed." };
}

export async function assignPackage(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const users = formData.getAll("user_ids").map(String);
  const due = String(formData.get("due_at") || "");
  const { data, error } = await supabase.rpc("assign_training_package", {
    p_package: String(formData.get("package_id")),
    p_users: users,
    p_due: due ? new Date(due).toISOString() : null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/training/packages");
  revalidatePath("/training/dashboard");
  return { ok: true, message: `${data} trainee${data === 1 ? "" : "s"} assigned.` };
}

// ---- Trainee flow (T-LEARN) ----
export async function saveProgress(assignmentId: string, pct: number): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_training_progress", {
    p_assignment: assignmentId,
    p_pct: Math.round(pct),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: String(data) };
}

export async function fetchAssessment(assignmentId: string): Promise<
  | { ok: true; assessment: unknown }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_assessment", { p_assignment: assignmentId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, assessment: data };
}

export async function submitAssessment(
  assignmentId: string,
  answers: Record<string, number>,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_assessment", {
    p_assignment: assignmentId,
    p_answers: answers,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/training");
  return { ok: true, result: data };
}

// ---- Settings + branding ----
export async function saveTrainingSettings(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const maxAttempts = String(formData.get("max_attempts") || "").trim();
  const { error } = await supabase.rpc("set_training_settings", {
    p_pass_mark: Number(formData.get("pass_mark") || 80),
    p_max_attempts: maxAttempts ? Number(maxAttempts) : null,
    p_default_due_days: Number(formData.get("default_due_days") || 14),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/training/packages");
  return { ok: true, message: "Training settings saved." };
}

export async function saveBranding(formData: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_tenant_branding", {
    p_display_name: String(formData.get("display_name") || ""),
    p_logo_ref: String(formData.get("logo_ref") || "") || null,
    p_color_primary: String(formData.get("color_primary") || "") || null,
    p_color_secondary: String(formData.get("color_secondary") || "") || null,
    p_color_accent: String(formData.get("color_accent") || "") || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/org/branding");
  return { ok: true, message: "Branding saved." };
}
