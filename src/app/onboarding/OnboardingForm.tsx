"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitOnboarding } from "./actions";

export type Field = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "checkbox" | "date" | "number";
  required?: boolean;
  options?: string[];
};
export type Step = { key: string; title: string; fields: Field[] };

// Renders the configured steps as pages and submits the collected data. On success
// the user is sent into the app. Field set is driven entirely by the flow config.
export function OnboardingForm({ steps }: { steps: Step[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <form action={onSubmit} className="flex flex-col gap-8">
      {steps.map((step) => (
        <section key={step.key}>
          <h2 className="text-sm font-semibold text-neutral-700">{step.title}</h2>
          <div className="mt-3 flex flex-col gap-4">
            {step.fields.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-sm">
                <span className="text-neutral-600">
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                </span>
                <FieldInput field={f} />
              </label>
            ))}
          </div>
        </section>
      ))}
      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-md bg-neutral-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        Finish onboarding
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function FieldInput({ field: f }: { field: Field }) {
  const base = "rounded-md border border-neutral-300 px-3 py-2 text-sm";
  if (f.type === "textarea") return <textarea name={f.key} required={f.required} className={base} rows={3} />;
  if (f.type === "checkbox") return <input type="checkbox" name={f.key} value="yes" />;
  if (f.type === "select")
    return (
      <select name={f.key} required={f.required} className={base}>
        <option value="">— select —</option>
        {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  return <input type={f.type} name={f.key} required={f.required} className={base} />;
}
