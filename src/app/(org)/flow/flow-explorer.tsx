"use client";

import { useState } from "react";
import { PanelRightClose, PanelRightOpen, Loader2, Check, Lock, LockOpen } from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { inspectFlow, type FlowInspect } from "./actions";

type Doc = { id: string; document_number: string | null; title: string; status: string };

// A branch module that hangs off a stage (a switchboard seam). Shown always; when
// the tenant has it off it greys out with a lock and the main flow passes it by.
type Seam = { label: string; hint: string; moduleKey: string };

// The document-control spine, mirroring DOCS/core_build_state_with_seams.png.
// Each stage names the document.status values that land on it; `seam` is the
// switchboard module that branches off that stage.
const STAGES: {
  key: string;
  label: string;
  hint: string;
  accent: string; // dot tone, echoing the reference diagram's palette
  statuses: string[];
  seam?: Seam;
}[] = [
  { key: "intake", label: "Intake", hint: "Authored as a draft — the one door in", accent: "bg-violet-500",
    statuses: ["draft"] },
  { key: "review", label: "Review & approval", hint: "HOD endorsement · QA review · segregation of duties", accent: "bg-violet-500",
    statuses: ["in_review"] },
  { key: "effective", label: "Effective", hint: "Approved; going live", accent: "bg-amber-500",
    statuses: ["pending_training", "scheduled"],
    seam: { label: "Training", hint: "Trainees certified before go-live", moduleKey: "training" } },
  { key: "live", label: "Read surface & Library", hint: "Live, effective, readable tenant-wide", accent: "bg-emerald-500",
    statuses: ["active"],
    seam: { label: "Periodic review", hint: "Scheduled effectiveness reviews", moduleKey: "periodic_review" } },
  { key: "change", label: "Under change control", hint: "Locked while a change is processed", accent: "bg-amber-500",
    statuses: ["locked_in_cc"],
    seam: { label: "Copy reconciliation", hint: "Issued copies accounted for", moduleKey: "controlled_copies" } },
  { key: "retire", label: "Supersede → retain", hint: "Superseded or retired; retention → destruction", accent: "bg-slate-400",
    statuses: ["retired"] },
];

// Friendly names for the 13 change-control sub-stages (collapsed to one node,
// named in the context panel).
const CC_LABELS: Record<string, string> = {
  submitted: "Submitted — awaiting QA screening",
  clarification_requested: "Clarification requested",
  impact_pending: "Impact assessment underway",
  classified: "Classified",
  queued: "Queued (document locked)",
  approved_for_document_work: "Approved for document work",
  documents_in_review: "Revised documents in review",
  signatures_pending: "Awaiting signatures",
  pending_reconciliation: "Reconciling controlled copies",
  pending_training: "Awaiting training",
  effective: "Changes going effective",
  effectiveness_review: "Effectiveness review",
};

function stageIndex(status: string): number {
  const i = STAGES.findIndex((s) => s.statuses.includes(status));
  return i === -1 ? 0 : i;
}

// The narrative for the context panel — enough to orient, not a wall of text.
function narrative(r: FlowInspect): string {
  const rev = r.revision != null ? ` (revision ${String(r.revision).padStart(2, "0")})` : "";
  switch (r.doc_status) {
    case "draft":
      return "Being authored. Not yet submitted for endorsement or QA review.";
    case "in_review":
      return "Submitted — moving through HOD endorsement and QA review under segregation of duties.";
    case "pending_training":
      return "Approved by QA. Awaiting training completion before it becomes effective.";
    case "scheduled":
      return "Approved and scheduled to become effective on its planned date.";
    case "active":
      return `Live and effective${rev} — readable tenant-wide from the Library.`;
    case "locked_in_cc":
      return `Under change control${r.cc_status ? ` — ${CC_LABELS[r.cc_status] ?? r.cc_status}` : ""}. Locked to concurrent edits while the change is processed.`;
    case "retired":
      return "Retired — superseded or withdrawn, now moving through retention toward destruction.";
    default:
      return "Position unknown.";
  }
}

// A stage's branch module: always drawn; greyed + locked when the tenant has it off.
function SeamBranch({ seam, enabled, current }: { seam: Seam; enabled: boolean; current: boolean }) {
  return (
    <div className="flex items-center">
      {/* the tap into the main flow */}
      <span className={cn("h-0.5 w-6 shrink-0", enabled ? "bg-border" : "border-t border-dashed border-border")} />
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-left",
          !enabled && "border-dashed opacity-55",
          enabled && current && "border-primary/50 bg-primary/5",
        )}
        title={enabled ? `${seam.label} — in use` : `${seam.label} — not enabled for your organization`}
      >
        {enabled ? (
          <LockOpen className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
        ) : (
          <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <div className="text-xs font-medium">{seam.label}</div>
          <div className="text-[10px] text-muted-foreground">{enabled ? seam.hint : "Not in use"}</div>
        </div>
      </div>
    </div>
  );
}

export function FlowExplorer({
  documents,
  moduleStates,
}: {
  documents: Doc[];
  moduleStates: Record<string, boolean>;
}) {
  const [selected, setSelected] = useState<Doc | null>(null);
  const [result, setResult] = useState<FlowInspect | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const active = result ? stageIndex(result.doc_status) : -1;

  async function pick(doc: Doc) {
    setSelected(doc);
    setResult(null);
    setError(null);
    setLoading(true);
    const res = await inspectFlow(doc.id);
    setLoading(false);
    if (res.ok) {
      setResult(res.data);
      setPanelOpen(true);
    } else {
      setError(res.error);
    }
  }

  return (
    <>
      {/* ponytail: keyframes scoped here so the module owns its animation and
          globals.css stays untouched. Reduced-motion freezes the flow. */}
      <style>{`
        @keyframes flowmap-move { to { background-position: 0 -16px; } }
        .flowmap-live {
          background-image: repeating-linear-gradient(
            to bottom, hsl(var(--primary)) 0 6px, transparent 6px 12px);
          background-size: 100% 16px;
          animation: flowmap-move 0.9s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .flowmap-live { animation: none; }
        }
      `}</style>

      {/* Search + dropdown: one searchable list of every SOP. */}
      <div className="mb-6 max-w-xl rounded-lg border bg-card">
        <Command>
          <CommandInput placeholder="Search a document by number or title…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No documents found.</CommandEmpty>
            <CommandGroup>
              {documents.map((d) => (
                <CommandItem
                  key={d.id}
                  value={`${d.document_number ?? ""} ${d.title}`}
                  onSelect={() => pick(d)}
                  className="gap-2"
                >
                  {selected?.id === d.id && <Check className="size-4 shrink-0" />}
                  <span className="font-mono text-xs text-muted-foreground">
                    {d.document_number ?? "—"}
                  </span>
                  <span className="truncate">{d.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* The flowchart */}
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-6 min-h-5 text-center text-sm">
            {loading && (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Locating the document…
              </span>
            )}
            {error && <span className="text-destructive">{error}</span>}
            {!loading && !error && !result && (
              <span className="text-muted-foreground">
                Pick a document above to trace its position through the flow.
              </span>
            )}
            {!loading && !error && result && (
              <span className="font-mono text-xs text-muted-foreground">
                {result.document_number ?? "—"} · <span className="text-foreground">{result.title}</span>
              </span>
            )}
          </div>

          <ol className="mx-auto flex max-w-2xl flex-col items-stretch">
            {STAGES.map((stage, i) => {
              const state = active === -1 ? "idle" : i < active ? "done" : i === active ? "current" : "upcoming";
              const seamEnabled = stage.seam ? moduleStates[stage.seam.moduleKey] === true : false;
              return (
                <li key={stage.key}>
                  {/* Row: [left spacer] [centred main node] [branch] — the grid keeps
                      the spine centred whether or not a branch is present. */}
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                    <span />
                    <div
                      className={cn(
                        "flex w-64 flex-col items-center rounded-lg border px-4 py-3 text-center transition-colors",
                        state === "current" && "border-primary bg-primary/5 shadow-sm ring-1 ring-primary",
                        state === "upcoming" && "opacity-45",
                        state === "idle" && "opacity-75",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", stage.accent, state === "upcoming" && "opacity-40")} />
                        <span className="font-medium">{stage.label}</span>
                        {state === "current" && <Badge className="text-[10px]">Here now</Badge>}
                        {state === "done" && <Check className="size-3.5 text-primary" />}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{stage.hint}</p>
                    </div>
                    <div className="flex justify-start">
                      {stage.seam && (
                        <SeamBranch seam={stage.seam} enabled={seamEnabled} current={state === "current"} />
                      )}
                    </div>
                  </div>

                  {/* Centred connector to the next stage; the traversed path flows. */}
                  {i < STAGES.length - 1 && (
                    <div className="grid grid-cols-[1fr_auto_1fr]">
                      <span />
                      <span
                        className={cn("mx-auto h-8 w-1 rounded-full", active !== -1 && i < active ? "flowmap-live" : "bg-border")}
                      />
                      <span />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="mx-auto mt-4 flex max-w-2xl flex-col items-center">
            <span className="h-8 w-1 rounded-full bg-border" />
            <div className="w-full rounded-md bg-muted/50 px-3 py-2 text-center text-xs text-muted-foreground">
              Audit spine — every step above is recorded on the tamper-evident trail.
            </div>
          </div>
        </div>

        {/* Collapsible context panel */}
        <div>
          {!panelOpen ? (
            <Button variant="outline" size="sm" onClick={() => setPanelOpen(true)} className="w-full">
              <PanelRightOpen className="size-4" /> Show details
            </Button>
          ) : (
            <div className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Where it stands</h2>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setPanelOpen(false)}>
                  <PanelRightClose className="size-4" />
                </Button>
              </div>
              {result ? (
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {result.document_number ?? "—"}
                    </p>
                    <p className="font-medium">{result.title}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Current stage</p>
                    <p className="font-medium">{STAGES[active]?.label}</p>
                  </div>
                  <p className="text-muted-foreground">{narrative(result)}</p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a document to see a plain-language summary of its journey so far and where it is now.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
