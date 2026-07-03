# Training Module — Build Plan (AI-assisted)

> **What this is.** The build plan for the Training module — the first module to attach to the document-control core, plugging into **seam B (the effective window)**. It is AI-assisted: AI drafts the training slides from the controlled document, generates the assessment questions, and issues the certificate. This plan is written for the implementation agent and assumes the core has passed its verification checklist (seams proven, swap-test green).
>
> **Position in the architecture.** This is a **module**, not core. It registers on the switchboard (per-tenant on/off + config), connects only through the seam-B contract, holds no authoritative document data, and writes every action to the audit spine. If it is off, the core's safe default applies (no training gate) and every flow still completes. Nothing in this module may weaken a core guard.

---

## 1. Design principles

**1.1 AI drafts, humans approve — always.** This is the one principle added beyond the stated requirements, and it is non-negotiable in a GxP context: AI-generated training content (slides and questions) is a **draft** until a human trainer/QA reviews and approves it. Training records are GxP records; an AI hallucination in training material about a controlled procedure is a compliance and safety risk. The flow is: AI generates → trainer reviews/edits → trainer approves → only then can it be assigned. Unapproved AI content can never reach a trainee. The approval is an audited, attributable action.

**1.2 Training is version-specific.** A training package is generated from, and permanently linked to, a **specific document version** (system version id). Training completed on rev 02 does not count for rev 03. When a document is revised, the effective window asks for training on the *new* version, and a new package is generated (or the trainer clones and updates the old one). Certificates state the document number, title, **and revision** trained on.

**1.3 One AI source, centralized.** All AI operations — slide generation, question generation, any future AI feature anywhere on the platform — route through a single **AI Gateway** service. The gateway holds the provider configuration (Gemini as the primary/default), so swapping or adding providers is a change in one place, never scattered through modules. No module ever calls an AI provider directly.

**1.4 Nothing escapes the audit.** Every step is captured: who assigned the training, to whom, when; when the trainee started, progressed, completed; every assessment attempt and score; certificate issuance; every AI generation call (with provenance — see §3.4); every trainer approval or edit of AI content. If it happened in this module, it is in the audit spine, attributable and timestamped.

**1.5 Module discipline.** The module consumes the core's read surface for document content (it never reads the version store directly), honors the seam-B contract exactly, and is fully removable — switch it off and the core runs on its safe default.

---

## 2. The seam-B contract (how this module talks to the core)

The core, at the effective window, asks the module two questions and waits:

1. **`is_training_required(document_version_id)`** → the module answers based on the trainer/QA's setting for that version (set during the approval flow in the core, or configured in the module).
2. **`is_threshold_met(document_version_id)`** → the module answers based on completion records vs the configured threshold %.

The module additionally provides:
3. **`is_user_trained(user_id, document_version_id)`** → consumed by the core's execution-block guard: when training is required and a user hasn't completed it, that user is **blocked from executing** against the document. (The block is a core guard; the module supplies the answer.)

Events the module emits back to the core/audit: training assigned, completed, threshold reached, certificate issued. Events the module listens for: version approved-pending-training (triggers package preparation), version effective (activates assignments), version superseded (closes/expires assignments for the old version).

**Safe default (module off):** core treats training as not required — unchanged from the core build.

---

## 3. The AI Gateway (centralized AI layer)

**3.1 What it is.** A single platform-level service through which every AI call on the platform flows. Built once, used by this module first, reused by every future AI feature.

**3.2 Provider abstraction.** The gateway exposes internal operations (e.g. `generate_slides`, `generate_questions`) and maps them to a configured provider. **Gemini is the primary/default provider.** The provider (and model version) is platform-level configuration — swappable without touching any module. Design the interface so adding a second provider later is additive.

**3.3 Inputs and grounding.** For training generation, the gateway is given the **approved effective content of the specific document version being trained on** (retrieved via the core read surface) plus the template/branding parameters and generation settings (e.g. question count). **Both slides and assessment questions are derived strictly from the selected SOP's content** — the prompt instructs the model to generate only from the provided document text, never from general knowledge. A question that cannot be answered from the SOP itself is a defective question. When a training covers a revision, the reason-for-change and changed sections are included in the grounding so the AI can emphasize what's new.

**3.4 AI provenance logging (required).** Every gateway call writes an audit record capturing: which operation, which provider and model (and version identifier), when, initiated by whom, for which document version, and a reference to the generated output. In a regulated context you must be able to answer "where did this training content come from?" — the answer is: generated by model X on date Y from document version Z, reviewed and approved by person P. The human approval (§1.1) completes the provenance chain.

**3.5 Failure behavior.** If the provider is unavailable or generation fails, the module degrades gracefully: the trainer is informed and can retry, or author slides/questions manually. AI unavailability never blocks the core (the seam answers are based on assignments/completions, not on AI availability) and never breaks a flow.

---

## 4. The training flow (end to end)

```
Document version approved with "training required"
  → 1. PACKAGE PREPARATION (trainer + AI)
       AI generates slide deck (from doc content, chosen template, org branding)
       AI generates assessment questions (count set by trainer)
       Trainer reviews/edits both → APPROVES package        [human gate — §1.1]
  → 2. ASSIGNMENT (trainer/QA)
       Trainer assigns package to the trainee population (roles/individuals)
       Each assignment: who assigned, to whom, when, due-by   [audited]
  → 3. TRAINEE COMPLETION
       Trainee opens training → views slides (progress bar advances)
       Completes slides → takes assessment
       Score shown; pass mark applied; retakes per policy
  → 4. CERTIFICATE
       On pass: branded, professional certificate issued
       Unique certificate id; states doc number/title/REVISION, trainee, date, score
       Downloadable as PDF; stored on the trainee's record
  → 5. THRESHOLD & THE SEAM
       Completions accumulate → threshold % reached → seam B answers "met"
       → core proceeds (document goes effective / released)
       Stragglers remain tracked; untrained users blocked from execution
  → 6. TRACKING (continuous)
       Trainee sees own progress bar
       Manager sees per-trainee progress bars + dashboard
       (completion rates, done / not done, overdue, scores, full history)
```

### 4.1 Package states

| State | Meaning |
|---|---|
| `generating` | AI producing slides/questions |
| `draft_review` | Awaiting trainer review/edit of AI output |
| `approved` | Trainer approved — assignable |
| `assigned` | Live to trainees |
| `closed` | Version superseded/retired, or package withdrawn |

### 4.2 Assignment states (per trainee)

| State | Meaning |
|---|---|
| `assigned` | Not yet started |
| `in_progress` | Slides partially viewed (progress % tracked) |
| `awaiting_assessment` | Slides done, assessment not passed yet |
| `completed` | Passed — certificate issued |
| `overdue` | Past due-by without completion |

---

## 5. Slides (AI-generated, templated, branded)

- **Generation.** AI (via the gateway) produces a slide deck derived strictly from the document version's content: purpose, scope, key steps, responsibilities, critical points, changes from the prior revision (when this is a revision — pull the reason-for-change).
- **Templates.** ~**5 platform templates** determine slide design/layout (e.g. clean-corporate, visual-steps, compact-brief, detailed-walkthrough, change-summary). The trainer picks the template at generation time. Templates are platform assets — consistent, professional, maintained centrally.
- **Branding.** Slides carry the **organization's logo, name, and colors**. Branding values come from a per-tenant **branding configuration**: logo + name are set now; **the color fields exist in the schema but are left empty/default for now** — they will be collected during the onboarding process when that is built. Design the branding config so onboarding can later populate colors without any change to this module (the module reads whatever the branding config holds, falling back to a neutral default palette when colors are unset).
- **Review/edit — full control, smooth UX.** Before approval, the trainer can **edit the AI-generated text inline** on any slide (click into the text and change it — no separate edit form), **reorder slides via drag-and-drop**, add or delete slides. Reordering feels immediate: grab handle, drag, drop, order persists. Edits are tracked (AI draft vs approved version distinguishable in the record), and the whole review experience should feel effortless — the trainer is polishing a draft, not fighting a form.
- **Viewing.** Trainees view slides in-app with a **progress bar** reflecting completion through the deck. Progress is saved (resume where you left off) and every view session is recorded.

## 6. Assessment (configurable, scored, gated)

- **Generation.** AI generates questions **grounded strictly in the selected SOP's content** — every question must be answerable from the document being trained on (§3.3). **The trainer configures the number of questions** per package (a per-package setting the trainer chooses at generation time; sensible bounds e.g. 3–25).
- **Review — same smooth control as slides.** The trainer can **edit any question or answer option inline**, **reorder questions via drag-and-drop**, delete questions, and regenerate individual questions. Same human gate: nothing reaches a trainee unapproved.
- **Pass mark.** A configurable **pass threshold** (e.g. 80%) per tenant with per-package override. *(Not in the original requirements but required: a score alone doesn't gate anything — "completed" must mean "passed." The pass-mark value is QA-ratified configuration.)*
- **Retakes.** Configurable retake policy (e.g. unlimited / N attempts / cooldown). Every attempt is recorded with its score — attempts are never overwritten or deleted.
- **Score display.** On submission the trainee sees their score, pass/fail, and (configurable) which areas to review. The score is stored on the record and shown on the certificate.

## 7. Certificate

- Issued automatically on pass. **Branded** (org logo/name, colors when available) and **professional** in design.
- Contains: trainee name, document number + title + **revision**, package/certificate unique id, completion date, score, assigner, organization name.
- **Downloadable as PDF** by the trainee and **stored** on their training record — retrievable any time from their profile and from the manager's records.
- Certificate issuance is an audited event; the certificate id is verifiable against the record (an inspector can check a paper certificate against the system).

## 8. Progress & tracking (trainee and manager)

- **Trainee view:** their assigned trainings with a **progress bar** per training (slides % → assessment → done), due dates, scores, and their certificate archive.
- **Manager/trainer view:** per-trainee **progress bars** for every assignment on a package; and a **training dashboard**: completion rate per package/document, who has done it / not done it, overdue list, average scores, attempts, time-to-complete, threshold status vs the seam (how far from release). Filterable by department, document, date range. Exportable for inspection.
- All tracking reads derive from the assignment/attempt records — no separate counters to drift.

---

## 9. Data model

| Table | Key columns (beyond ids/tenancy/audit) |
|---|---|
| `training_packages` | document_version_id (FK — version-specific), template_id, question_count, pass_mark, state, ai_generation_ref, approved_by, approved_at |
| `training_slides` | package_id, **order (drag-and-drop persisted)**, content, ai_draft_content (provenance), edited_by |
| `training_questions` | package_id, **order (drag-and-drop persisted)**, question, options/answer, ai_draft (provenance), edited_by |
| `training_assignments` | package_id, trainee_id, assigned_by, assigned_at, due_at, state, slide_progress_pct, completed_at |
| `assessment_attempts` | assignment_id, started_at, submitted_at, score, passed (append-only — attempts never deleted) |
| `certificates` | assignment_id, certificate_uid, issued_at, score, pdf_ref |
| `tenant_branding` | logo_ref, org_display_name, color_primary (nullable — onboarding later), color_secondary (nullable), color_accent (nullable) |
| `ai_gateway_log` | operation, provider, model_version, requested_by, document_version_id, output_ref, requested_at (append-only) |

All tables tenant-scoped (RLS), all writes audited via the spine.

## 10. Screens

- **T-PACKAGES — Training packages** (trainer/QA). Packages per document version; generate (pick template, set question count), review AI drafts, edit, approve, assign.
- **T-REVIEW — AI draft review** (trainer). The polish surface: slides and questions shown as editable cards — **click any text to edit inline, drag-and-drop to reorder** (grab handles, smooth drop animation), add/delete/regenerate items. The human gate lives here, and it's the screen that must feel best in the whole module — the trainer should enjoy shaping the draft, not endure it.
- **T-ASSIGN — Assignment** (trainer). Pick trainees (individuals/roles/department), set due date. Shows who assigned what, when.
- **T-LEARN — Trainee training view.** Slides with progress bar → assessment → score → certificate download. Resume support.
- **T-MY-TRAINING — Trainee home.** Their assignments, progress bars, due dates, certificate archive (PDF downloads).
- **T-DASHBOARD — Manager training dashboard.** Per-package and per-trainee progress bars, completion rates, done/not-done, overdue, scores, threshold-vs-release status. Filter + export.
- **T-BRANDING — Branding config** (org admin/QA). Logo + org name now; color fields present but marked "collected at onboarding" (editable when onboarding lands).
- **(Platform) AI-GATEWAY-CONFIG** — provider/model settings (platform plane; Gemini default).

## 11. Configurability (scoped — presentation vs enforcement)

**Configurable (per tenant / per package):** template choice; question count (trainer, per package); pass mark value; retake policy; threshold % (feeds the seam); due-date defaults; branding (logo/name now, colors at onboarding); module on/off (switchboard).
**Not configurable (enforcement):** the human-approval gate on AI content; version-specificity of training; append-only attempts; the execution block on untrained users when training is required; audit completeness; the seam contract; AI calls routing through the gateway.

## 12. Build phases

**Phase T0 — AI Gateway.** The centralized service: provider abstraction, Gemini integration, provenance logging, failure handling. *Done when:* a gateway call generates grounded output, logs full provenance, and a provider swap is a config change only.

**Phase T1 — Data model + seam wiring.** Tables above; implement the three seam answers; module registered on switchboard. *Done when:* swap-test passes both ways (module off → core defaults; module on → core defers), and `is_user_trained` correctly feeds the core's execution block.

**Phase T2 — Package generation + human gate.** Slide + question generation via gateway, grounded strictly in the selected SOP; the 5 templates; branding applied (colors gracefully absent); T-PACKAGES + T-REVIEW with **inline text editing and drag-and-drop reordering for both slides and questions**; approval flow. *Done when:* AI drafts generate from the SOP's content only; the trainer can edit any text inline, reorder slides and questions by drag-and-drop with the order persisting, and approve; unapproved content is unassignable; provenance (AI draft → approved version) is inspectable; a spot-check confirms every generated question is answerable from the SOP itself.

**Phase T3 — Assignment + trainee experience.** T-ASSIGN, T-LEARN, T-MY-TRAINING; progress persistence; assessment with configurable count, pass mark, retakes; score display. *Done when:* a trainee completes end to end, every step audited, attempts append-only, resume works.

**Phase T4 — Certificates.** Branded PDF generation, unique ids, download + storage, verifiability. *Done when:* pass → certificate issued automatically, PDF downloads, id verifies against the record.

**Phase T5 — Threshold, tracking + dashboard.** Threshold computation feeding seam B; T-DASHBOARD with all tracking; straggler surfacing; exports. *Done when:* threshold reached flips the seam answer and the core proceeds; the dashboard shows completion rates, done/not-done, overdue, scores; a full training history for one document version exports as an inspector-readable story.

**Acceptance walkthrough (module-level definition of done):** on a real document version — generate a package with a chosen template and question count → trainer edits one slide and one question → approves → assigns to 3 users → 2 complete (one needing a retake), 1 stays overdue → threshold at 66% answers "met" → core releases the document → overdue user is blocked from execution until completing → certificates download as branded PDFs → the manager dashboard reflects all of it → the audit export tells the entire story: who assigned, when trained, what the AI generated, who approved it. **Nothing missing.**

## 13. Open items (ratify before go-live)

- Pass-mark value and retake policy — client QA ratifies.
- Threshold % per document class — client QA ratifies (already a Section-14 item).
- Branding colors — collected at onboarding (schema ready now).
- Template designs — 5 to be designed; trainer picks per package.
- Gemini model version pinning policy — pin a model version for reproducibility vs auto-upgrade; recommend pinning, reviewed periodically (provenance log makes either auditable).

*End of training module build plan.*
