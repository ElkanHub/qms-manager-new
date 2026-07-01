"use client";

import { useActionState } from "react";

type Result = { ok: true; message?: string } | { ok: false; error: string };
type Action = (formData: FormData) => Promise<Result>;

// Thin form wrapper that runs a server action and surfaces its ok/error/message.
// One component reused by every org/platform form so error handling is consistent.
export function ActionForm({
  action,
  submitLabel,
  children,
}: {
  action: Action;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<Result | null, FormData>(
    async (_prev, formData) => action(formData),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {children}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {submitLabel}
      </button>
      {state && !state.ok && <p className="text-sm text-red-600">{state.error}</p>}
      {state && state.ok && (
        <p className="break-all text-sm text-green-700">{state.message ?? "Done."}</p>
      )}
    </form>
  );
}
