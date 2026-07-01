import { redirect } from "next/navigation";
import { getAppUser, getAuthUser, mfaRequired } from "@/lib/auth";
import { bootstrapOwnerIfEligible } from "@/app/platform/actions";

// Post-sign-in router. Runs the one-time owner bootstrap if eligible, then sends
// the user to their plane. An authenticated-but-unbound identity is a dead-end
// (no signup fallback, rule 0.5).
export default async function Start() {
  const authUser = await getAuthUser();
  if (!authUser) redirect("/signin");

  await bootstrapOwnerIfEligible(); // no-op unless configured owner + no owner yet

  const user = await getAppUser();
  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">No account bound</h1>
        <p className="text-sm text-neutral-600">
          This Google identity isn&apos;t linked to any organization. Access is by
          invitation only — ask your QA to invite you.
        </p>
      </main>
    );
  }
  if (await mfaRequired()) redirect("/mfa");
  redirect(user.plane === "platform" ? "/platform" : "/org");
}
