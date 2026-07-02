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
  type: "text" | "textarea" | "select" | "checkbox" | "date" | "number";
  required?: boolean;
  options?: string[];
};
export type Step = { key: string; title: string; fields: Field[] };

// Renders the configured steps as sections of one card form and submits the collected
// data. On success the user is sent into the app. Field set is driven entirely by config.
export function OnboardingForm({ steps }: { steps: Step[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const requiredKeys = steps.flatMap((s) => s.fields.filter((f) => f.required).map((f) => f.key));
  const multiStep = steps.length > 1;

  // ponytail: progress just reflects how many required fields are filled; server
  // (submit_onboarding) is the real gate, so an indicative bar is enough.
  function recompute(form: HTMLFormElement) {
    if (!requiredKeys.length) return;
    const fd = new FormData(form);
    const filled = requiredKeys.filter((k) => String(fd.get(k) ?? "").trim() !== "").length;
    setProgress(Math.round((filled / requiredKeys.length) * 100));
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
  return <Input id={f.key} type={f.type} name={f.key} required={f.required} />;
}
