"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitOnboarding } from "./actions";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Field = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "date" | "number" | "color";
  required?: boolean;
  options?: string[];
};
export type Step = { key: string; title: string; fields: Field[] };

// Live values for the branding step's preview (canonical field keys — the
// submit action maps these through set_tenant_branding).
type Brand = {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
};
const BRAND_DEFAULTS: Brand = { name: "", primary: "#166534", secondary: "#0f172a", accent: "#ca8a04" };

// Renders the configured steps as sections of one card form and submits the collected
// data. On success the user is sent into the app. Field set is driven entirely by config.
// A step with key "branding" additionally shows a live preview of the chosen identity
// (the same colors the certificates and training decks consume).
export function OnboardingForm({ steps }: { steps: Step[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [brand, setBrand] = useState<Brand>(BRAND_DEFAULTS);

  const requiredKeys = steps.flatMap((s) => s.fields.filter((f) => f.required).map((f) => f.key));
  const multiStep = steps.length > 1;
  const hasBranding = steps.some((s) => s.key === "branding");

  // ponytail: progress just reflects how many required fields are filled; server
  // (submit_onboarding) is the real gate, so an indicative bar is enough.
  function recompute(form: HTMLFormElement) {
    const fd = new FormData(form);
    if (requiredKeys.length) {
      const filled = requiredKeys.filter((k) => String(fd.get(k) ?? "").trim() !== "").length;
      setProgress(Math.round((filled / requiredKeys.length) * 100));
    }
    if (hasBranding) {
      setBrand({
        name: String(fd.get("branding_display_name") ?? ""),
        primary: String(fd.get("branding_color_primary") || BRAND_DEFAULTS.primary),
        secondary: String(fd.get("branding_color_secondary") || BRAND_DEFAULTS.secondary),
        accent: String(fd.get("branding_color_accent") || BRAND_DEFAULTS.accent),
      });
    }
  }

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setError(null);
    const res = await submitOnboarding(formData);
    if (res.ok) router.push("/org");
    else {
      setBusy(false);
      setError(res.error);
    }
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-sm text-muted-foreground">Welcome</p>
        <CardTitle>Let&apos;s get you set up</CardTitle>
        <CardDescription>A few details from your organization before you start.</CardDescription>
        {multiStep && <Progress value={progress} className="mt-4" />}
      </CardHeader>
      <form action={onSubmit} onChange={(e) => recompute(e.currentTarget)}>
        <CardContent className="space-y-8">
          {steps.map((step) => (
            <section key={step.key} className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">{step.title}</h2>
              <div className="space-y-4">
                {step.fields.map((f) => (
                  <FieldRow key={f.key} field={f} />
                ))}
              </div>
              {step.key === "branding" && <BrandingPreview brand={brand} />}
            </section>
          ))}
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3">
          <Button type="submit" disabled={busy}>
            Finish onboarding
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardFooter>
      </form>
    </Card>
  );
}

// A mini certificate header + slide chip so whoever picks the colors sees what
// they'll produce. Pure preview — the real consumers are the certificate PDF
// and the training decks.
function BrandingPreview({ brand }: { brand: Brand }) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-xs text-muted-foreground">Live preview — certificate header and slide accent</p>
      <div className="overflow-hidden rounded border">
        <div className="h-2" style={{ backgroundColor: brand.primary }} />
        <div className="space-y-1 p-3">
          <p className="text-[10px] uppercase tracking-widest" style={{ color: brand.accent }}>
            Certificate of training
          </p>
          <p className="text-sm font-semibold" style={{ color: brand.secondary }}>
            {brand.name || "Your organization"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {[brand.primary, brand.secondary, brand.accent].map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <span className="size-4 rounded-full border" style={{ backgroundColor: c }} />
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

function RequiredMark({ show }: { show?: boolean }) {
  return show ? <span className="text-destructive"> *</span> : null;
}

function FieldRow({ field: f }: { field: Field }) {
  if (f.type === "checkbox") {
    return (
      <div className="flex items-center gap-2">
        <Checkbox id={f.key} name={f.key} value="yes" />
        <Label htmlFor={f.key} className="font-normal">
          {f.label}
          <RequiredMark show={f.required} />
        </Label>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={f.key}>
        {f.label}
        <RequiredMark show={f.required} />
      </Label>
      <FieldInput field={f} />
    </div>
  );
}

function FieldInput({ field: f }: { field: Field }) {
  if (f.type === "textarea") return <Textarea id={f.key} name={f.key} required={f.required} rows={3} />;
  if (f.type === "select")
    return (
      <Select name={f.key} required={f.required}>
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
    );
  if (f.type === "color")
    return (
      <Input
        id={f.key}
        type="color"
        name={f.key}
        required={f.required}
        defaultValue={
          f.key.endsWith("primary") ? "#166534" : f.key.endsWith("accent") ? "#ca8a04" : "#0f172a"
        }
        className="h-10 w-24 cursor-pointer p-1"
      />
    );
  return <Input id={f.key} type={f.type} name={f.key} required={f.required} />;
}
