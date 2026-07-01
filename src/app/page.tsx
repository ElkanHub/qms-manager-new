import Link from "next/link";

// Root landing. No public signup exists (rule 0.5) — the only door in is Sign in.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold">QMS Manager</h1>
        <p className="mt-2 text-neutral-600">
          Controlled, multi-tenant quality management. Access is invite-only.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/signin"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          Sign in
        </Link>
      </div>
      <p className="text-sm text-neutral-500">
        No account? You can only join by invitation from your organization&apos;s QA.
        There is no public sign-up.
      </p>
    </main>
  );
}
