import "server-only";

// The AI Gateway (TRAINING_MODULE_BUILD_PLAN §3) — the single place every AI
// call on the platform flows through. Modules never talk to a provider
// directly; the provider + model come from platform configuration
// (ai_gateway_config, set on the platform plane), and the API key comes from
// the environment only — it is never stored in the database.
//
// Grounding (§3.3): both slides and questions are derived STRICTLY from the
// provided document text. A question that cannot be answered from the SOP
// itself is a defective question — the prompts encode that rule.
//
// Provenance (§3.4) is written by the CALLER through the audited RPCs
// (store_ai_draft / log_ai_failure / log_ai_call): the gateway returns what
// the provider produced plus the identifiers needed to log it.

export type GatewaySlide = { title: string; body: string };
export type GatewayQuestion = {
  question: string;
  options: string[];
  correct_index: number;
  explanation?: string;
};
export type GeneratedPackage = { slides: GatewaySlide[]; questions: GatewayQuestion[] };

export type GenerationInput = {
  document: { number: string | null; title: string; revision: number | null };
  /** The approved content of the specific version being trained on. */
  sourceText: string;
  /** Included for revisions so the AI emphasizes what changed (§3.3). */
  reasonForChange?: string | null;
  templateKey: string;
  questionCount: number;
  orgName?: string | null;
};

export type GatewayConfig = { provider: string; model: string; settings: Record<string, unknown> };

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly model: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

// Template briefs — how each of the 5 platform templates shapes the deck (§5).
const TEMPLATE_BRIEFS: Record<string, string> = {
  "clean-corporate":
    "A clean, formal corporate deck: concise slides, one idea per slide, professional register.",
  "visual-steps":
    "A step-oriented deck: break the procedure into numbered steps, one step (or tight step group) per slide.",
  "compact-brief":
    "A compact briefing: the fewest slides that still cover purpose, scope, key steps and critical points.",
  "detailed-walkthrough":
    "A detailed walkthrough: cover the procedure thoroughly, including responsibilities and records, slide by slide.",
  "change-summary":
    "A change-focused deck: lead with WHAT CHANGED in this revision and why, then reinforce the affected steps.",
};

function slidePrompt(input: GenerationInput): string {
  return [
    `You are drafting GxP training slides for a controlled document.`,
    `Document: ${input.document.number ?? "(unnumbered)"} — ${input.document.title}` +
      (input.document.revision != null ? ` (revision ${String(input.document.revision).padStart(2, "0")})` : ""),
    input.reasonForChange ? `This is a revision. Reason for change: ${input.reasonForChange}` : "",
    `Template: ${TEMPLATE_BRIEFS[input.templateKey] ?? TEMPLATE_BRIEFS["clean-corporate"]}`,
    ``,
    `STRICT GROUNDING RULE: derive every slide ONLY from the document text below.`,
    `Do not add facts, steps, thresholds or requirements from general knowledge.`,
    `Cover: purpose, scope, key steps, responsibilities, critical points` +
      (input.reasonForChange ? `, and what changed in this revision` : "") + `.`,
    ``,
    `--- DOCUMENT TEXT ---`,
    input.sourceText,
    `--- END DOCUMENT TEXT ---`,
  ]
    .filter(Boolean)
    .join("\n");
}

function questionPrompt(input: GenerationInput, count: number): string {
  return [
    `You are drafting a GxP training assessment for a controlled document.`,
    `Document: ${input.document.number ?? "(unnumbered)"} — ${input.document.title}`,
    ``,
    `Write exactly ${count} multiple-choice questions with 3–4 options each.`,
    `STRICT GROUNDING RULE: every question MUST be answerable from the document`,
    `text below alone. A question that cannot be answered from the document is`,
    `DEFECTIVE — do not produce it. No trick questions, no general knowledge.`,
    `Mark the correct option with its zero-based index, and give a one-line`,
    `explanation quoting or referencing the relevant part of the document.`,
    ``,
    `--- DOCUMENT TEXT ---`,
    input.sourceText,
    `--- END DOCUMENT TEXT ---`,
  ].join("\n");
}

const SLIDES_SCHEMA = {
  type: "object",
  properties: {
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, body: { type: "string" } },
        required: ["title", "body"],
      },
    },
  },
  required: ["slides"],
};

const QUESTIONS_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct_index: { type: "integer" },
          explanation: { type: "string" },
        },
        required: ["question", "options", "correct_index"],
      },
    },
  },
  required: ["questions"],
};

// ---------------------------------------------------------------------------
// Providers. Adding one = adding an entry here (§3.2); nothing outside the
// gateway changes.
// ---------------------------------------------------------------------------
type ProviderCall = (model: string, prompt: string, schema: object) => Promise<unknown>;

async function callGemini(model: string, prompt: string, schema: object): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured on the server");
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.2,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini returned ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no content");
  return JSON.parse(text);
}

const PROVIDERS: Record<string, ProviderCall> = {
  gemini: callGemini,
};

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------
function validatePackage(raw: unknown, questionCount: number): GeneratedPackage {
  const slides = ((raw as { slides?: unknown[] }).slides ?? []) as GatewaySlide[];
  const questions = ((raw as { questions?: unknown[] }).questions ?? []) as GatewayQuestion[];
  const cleanSlides = slides
    .filter((s) => s && typeof s.title === "string" && typeof s.body === "string")
    .map((s) => ({ title: s.title.trim(), body: s.body.trim() }))
    .filter((s) => s.title || s.body);
  const cleanQuestions = questions
    .filter(
      (q) =>
        q &&
        typeof q.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        Number.isInteger(q.correct_index) &&
        q.correct_index >= 0 &&
        q.correct_index < q.options.length,
    )
    .slice(0, questionCount);
  if (cleanSlides.length === 0) throw new Error("the provider produced no usable slides");
  if (cleanQuestions.length === 0) throw new Error("the provider produced no usable questions");
  return { slides: cleanSlides, questions: cleanQuestions };
}

export async function generateTrainingPackage(
  config: GatewayConfig,
  input: GenerationInput,
): Promise<GeneratedPackage> {
  const call = PROVIDERS[config.provider];
  if (!call) throw new GatewayError(`unknown AI provider "${config.provider}"`, config.provider, config.model);
  try {
    const [slidesRaw, questionsRaw] = await Promise.all([
      call(config.model, slidePrompt(input), SLIDES_SCHEMA),
      call(config.model, questionPrompt(input, input.questionCount), QUESTIONS_SCHEMA),
    ]);
    return validatePackage(
      { ...(slidesRaw as object), ...(questionsRaw as object) },
      input.questionCount,
    );
  } catch (e) {
    throw new GatewayError(e instanceof Error ? e.message : String(e), config.provider, config.model);
  }
}

export async function generateSingleQuestion(
  config: GatewayConfig,
  input: GenerationInput,
): Promise<GatewayQuestion> {
  const call = PROVIDERS[config.provider];
  if (!call) throw new GatewayError(`unknown AI provider "${config.provider}"`, config.provider, config.model);
  try {
    const raw = await call(config.model, questionPrompt(input, 1), QUESTIONS_SCHEMA);
    const pkg = validatePackage({ slides: [{ title: "-", body: "-" }], ...(raw as object) }, 1);
    return pkg.questions[0];
  } catch (e) {
    throw new GatewayError(e instanceof Error ? e.message : String(e), config.provider, config.model);
  }
}
