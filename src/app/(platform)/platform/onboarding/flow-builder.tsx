"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  GripVertical,
  Loader2,
  Lock,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OnboardingWizard } from "@/components/app/onboarding-wizard";
import {
  DEFAULT_STEPS,
  AUDIENCE_LABELS,
  type Audience,
  type OnbStep,
  type OnbField,
} from "@/lib/onboarding-defaults";
import { setOnboardingFlow } from "../actions";

const FIELD_TYPES = ["text", "textarea", "select", "checkbox", "date", "number", "color"] as const;

// S-ONBOARDING v2 — the visual flow builder. The locked defaults (what the app
// itself needs: profile, org identity + branding, signature) render read-only;
// custom steps are added/edited/removed/reordered here and append after them.
// Preview runs the real wizard with the merged flow — exactly what the person
// will see, saving nothing.
export function FlowBuilder({
  tenantId,
  tenantName,
  initial,
}: {
  tenantId: string;
  tenantName: string;
  initial: Record<Audience, OnbStep[]>;
}) {
  return (
    <Tabs defaultValue="org_setup">
      <TabsList>
        {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
          <TabsTrigger key={a} value={a}>
            {AUDIENCE_LABELS[a]}
          </TabsTrigger>
        ))}
      </TabsList>
      {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
        <TabsContent key={a} value={a}>
          <AudienceEditor
            tenantId={tenantId}
            tenantName={tenantName}
            audience={a}
            initialSteps={initial[a] ?? []}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function AudienceEditor({
  tenantId,
  tenantName,
  audience,
  initialSteps,
}: {
  tenantId: string;
  tenantName: string;
  audience: Audience;
  initialSteps: OnbStep[];
}) {
  const [steps, setSteps] = useState<OnbStep[]>(initialSteps);
  const [pending, startTransition] = useTransition();
  const defaults = DEFAULT_STEPS[audience];
  const merged = [...defaults, ...steps];

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("tenant_id", tenantId);
      fd.set("audience", audience);
      fd.set("steps", JSON.stringify(steps));
      const res = await setOnboardingFlow(fd);
      if (res.ok) toast.success(`${tenantName}: ${AUDIENCE_LABELS[audience]} flow saved.`);
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4 pt-2">
      {/* Locked defaults — visible so the whole journey reads top to bottom */}
      <div className="space-y-2">
        {defaults.map((step, i) => (
          <div key={step.key} className="rounded-md border border-dashed bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              <Lock className="size-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">
                {i + 1}. {step.title}
              </span>
              <Badge variant="secondary" className="ml-auto">
                Default — required by the app
              </Badge>
            </div>
            <p className="mt-1 pl-6 text-xs text-muted-foreground">
              {step.signature
                ? "Signature capture: draw, sign on phone (QR), or upload — plus auto-generated initials."
                : step.fields.map((f) => f.label + (f.required ? " *" : "")).join(" · ")}
            </p>
          </div>
        ))}
      </div>

      {/* Custom steps — full control */}
      <div className="space-y-3">
        {steps.map((step, si) => (
          <StepEditor
            key={si}
            step={step}
            index={defaults.length + si + 1}
            onChange={(next) => setSteps((cur) => cur.map((s, i) => (i === si ? next : s)))}
            onRemove={() => setSteps((cur) => cur.filter((_, i) => i !== si))}
            onMove={(dir) =>
              setSteps((cur) => {
                const j = si + dir;
                if (j < 0 || j >= cur.length) return cur;
                const next = [...cur];
                [next[si], next[j]] = [next[j], next[si]];
                return next;
              })
            }
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setSteps((cur) => [
              ...cur,
              { key: `step_${Date.now().toString(36)}`, title: "New step", fields: [] },
            ])
          }
        >
          <Plus />
          Add step
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              <Eye />
              Preview the flow
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Preview — {AUDIENCE_LABELS[audience]} ({tenantName})
              </DialogTitle>
            </DialogHeader>
            <OnboardingWizard steps={merged} preview />
          </DialogContent>
        </Dialog>
        <Button type="button" onClick={save} disabled={pending} className="ml-auto">
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          Save flow
        </Button>
      </div>
    </div>
  );
}

function StepEditor({
  step,
  index,
  onChange,
  onRemove,
  onMove,
}: {
  step: OnbStep;
  index: number;
  onChange: (s: OnbStep) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const setField = (fi: number, next: OnbField) =>
    onChange({ ...step, fields: step.fields.map((f, i) => (i === fi ? next : f)) });

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <GripVertical className="size-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{index}.</span>
        <Input
          value={step.title}
          onChange={(e) => onChange({ ...step, title: e.target.value })}
          className="h-8 max-w-64 font-medium"
          aria-label="Step title"
        />
        <span className="ml-auto flex gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="Move step up" onClick={() => onMove(-1)}>
            <ArrowUp className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Move step down" onClick={() => onMove(1)}>
            <ArrowDown className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Remove step" onClick={onRemove}>
            <Trash2 className="size-4 text-muted-foreground" />
          </Button>
        </span>
      </div>

      {step.fields.map((f, fi) => (
        <div key={fi} className="flex flex-wrap items-center gap-2 pl-6">
          <Input
            value={f.label}
            onChange={(e) => {
              const label = e.target.value;
              const key = f.key.startsWith("cf_")
                ? f.key
                : `cf_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30)}`;
              setField(fi, { ...f, label, key });
            }}
            placeholder="Question / label"
            className="h-8 w-64"
          />
          <Select value={f.type} onValueChange={(v) => setField(fi, { ...f, type: v as OnbField["type"] })}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {f.type === "select" && (
            <Input
              value={(f.options ?? []).join(", ")}
              onChange={(e) =>
                setField(fi, { ...f, options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })
              }
              placeholder="Options, comma-separated"
              className="h-8 w-52"
            />
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox
              checked={!!f.required}
              onCheckedChange={(c) => setField(fi, { ...f, required: !!c })}
            />
            required
          </label>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove field"
            onClick={() => onChange({ ...step, fields: step.fields.filter((_, i) => i !== fi) })}
          >
            <Trash2 className="size-3.5 text-muted-foreground" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-6"
        onClick={() =>
          onChange({
            ...step,
            fields: [...step.fields, { key: `cf_${Date.now().toString(36)}`, label: "", type: "text" }],
          })
        }
      >
        <Plus className="size-3.5" />
        Add field
      </Button>
    </div>
  );
}
