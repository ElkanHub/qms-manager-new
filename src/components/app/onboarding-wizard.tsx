"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignatureCapture } from "@/components/app/signature-capture";
import { AvatarUpload } from "@/components/app/avatar-upload";
import type { OnbStep, OnbField } from "@/lib/onboarding-defaults";

// The onboarding wizard — one step per screen, a progress bar that moves with
// you, and light slide/fade transitions to take the stress out of the flow.
// The same component runs the REAL flow and the builder's PREVIEW (preview
// saves nothing and submits nothing). Server-side, submit_onboarding re-checks
// everything — this is ergonomics, not authority.
export function OnboardingWizard({
  steps,
  preview = false,
  hasSignature = false,
  onSubmit,
}: {
  steps: OnbStep[];
  preview?: boolean;
  /** Whether the user already has a captured signature (resume case). */
  hasSignature?: boolean;
  onSubmit?: (answers: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [signed, setSigned] = useState(hasSignature);
  const [direction, setDirection] = useState<"fwd" | "back">("fwd");
  const [pending, startTransition] = useTransition();

  const step = steps[index];
  const last = index === steps.length - 1;
  const progress = Math.round(((index + 1) / steps.length) * 100);
  const set = (key: string, value: string) => setAnswers((a) => ({ ...a, [key]: value }));

  function stepComplete(): string | null {
    if (preview) return null;
    if (step.signature && !signed) return "Capture your signature to continue.";
    for (const f of step.fields) {
      if (f.required && !(answers[f.key] ?? "").trim()) return `“${f.label}” is required.`;
    }
    return null;
  }

  function next() {
    const missing = stepComplete();
    if (missing) {
      toast.error(missing);
      return;
    }
    if (!last) {
      setDirection("fwd");
      setIndex((i) => i + 1);
      return;
    }
    if (preview) {
      toast.success("End of the flow — this is what your people will experience.");
      return;
    }
    startTransition(async () => {
      const res = await onSubmit?.(answers);
      if (res && !res.ok) toast.error(res.error ?? "Something went wrong.");
    });
  }

  const brandKeys = ["branding_color_primary", "branding_color_secondary", "branding_color_accent"];
  const showBrandPreview = step.fields.some((f) => brandKeys.includes(f.key));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span>
            Step {index + 1} of {steps.length}
          </span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className="transition-all duration-500" />
      </div>

      {/* keyed remount animates each step in; direction flavors the slide */}
      <div
        key={step.key + index}
        className={`animate-in fade-in duration-300 ${
          direction === "fwd" ? "slide-in-from-right-6" : "slide-in-from-left-6"
        }`}
      >
        <h2 className="mb-1 text-lg font-semibold">{step.title}</h2>
        {step.signature ? (
          <SignatureCapture
            fullName={answers.full_name ?? ""}
            preview={preview}
            onCaptured={() => setSigned(true)}
          />
        ) : step.avatar ? (
          <div className="pt-2">
            <AvatarUpload name={answers.full_name || "You"} preview={preview} />
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {step.fields.map((f) => (
              <FieldRow key={f.key} field={f} value={answers[f.key] ?? ""} onChange={(v) => set(f.key, v)} />
            ))}
            {showBrandPreview && <BrandPreview answers={answers} />}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={index === 0}
          onClick={() => {
            setDirection("back");
            setIndex((i) => Math.max(0, i - 1));
          }}
        >
          <ArrowLeft />
          Back
        </Button>
        <Button type="button" onClick={next} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : last ? <Check /> : <ArrowRight />}
          {last ? "Finish" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

function FieldRow({
  field: f,
  value,
  onChange,
}: {
  field: OnbField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (f.type === "checkbox")
    return (
      <div className="flex items-center gap-2">
        <Checkbox id={f.key} checked={value === "yes"} onCheckedChange={(c) => onChange(c ? "yes" : "")} />
        <Label htmlFor={f.key} className="font-normal">
          {f.label}
          {f.required && <span className="text-destructive"> *</span>}
        </Label>
      </div>
    );
  return (
    <div className="space-y-1.5">
      <Label htmlFor={f.key}>
        {f.label}
        {f.required && <span className="text-destructive"> *</span>}
      </Label>
      {f.type === "textarea" ? (
        <Textarea id={f.key} rows={3} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : f.type === "select" ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={f.key}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {(f.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : f.type === "color" ? (
        <Input
          id={f.key}
          type="color"
          value={value || defaultColor(f.key)}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-24 cursor-pointer p-1"
        />
      ) : (
        <Input id={f.key} type={f.type} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function defaultColor(key: string) {
  return key.endsWith("primary") ? "#166534" : key.endsWith("accent") ? "#ca8a04" : "#0f172a";
}

// Live brand preview (mini certificate header) while the colors are picked.
function BrandPreview({ answers }: { answers: Record<string, string> }) {
  const primary = answers.branding_color_primary || "#166534";
  const secondary = answers.branding_color_secondary || "#0f172a";
  const accent = answers.branding_color_accent || "#ca8a04";
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs text-muted-foreground">Live preview — certificate header</p>
      <div className="overflow-hidden rounded border">
        <div className="h-2" style={{ backgroundColor: primary }} />
        <div className="space-y-1 p-3">
          <p className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>
            Certificate of training
          </p>
          <p className="text-sm font-semibold" style={{ color: secondary }}>
            {answers.branding_display_name || "Your organization"}
          </p>
        </div>
      </div>
    </div>
  );
}
