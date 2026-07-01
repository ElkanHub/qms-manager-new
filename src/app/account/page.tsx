import { requireUser } from "@/lib/auth";
import { SignOutButton } from "./SignOutButton";

// S-ACCOUNT — a user's own minimal account view + MFA/device management.
// No self-service role changes (roles are granted by QA, Phase 4).
export default async function Account() {
  const user = await requireUser();

  return (
    <main className="mx-auto max-w-xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your account</h1>
        <SignOutButton />
      </div>

      <dl className="mt-6 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        <Row label="Name" value={user.full_name ?? "—"} />
        <Row label="Email" value={user.email} />
        <Row label="Plane" value={user.plane} />
        <Row label="Role at invitation" value={user.initial_role ?? "—"} />
        <Row label="Status" value={user.status} />
      </dl>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-700">Security</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Multi-factor authentication is mandatory. Manage your authenticator and trusted
          devices from your sign-in. You cannot disable MFA — only satisfy it.
        </p>
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-4 py-3 text-sm">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
