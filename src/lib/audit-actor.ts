// Org-facing audit privacy: a platform-plane actor's email must never be shown to
// an organization — only that "Platform" acted (the platform link is the owner's
// plane; its addresses are not the tenant's business). These helpers mask such
// actors while leaving ordinary org actors untouched. Apply ONLY for org-plane
// viewers; a platform admin viewing a tenant's trail still sees real emails.

export const PLATFORM_ACTOR_LABEL = "Platform";

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }>;
};

// Which of the given emails belong to platform-plane users (via a SECURITY DEFINER
// lookup, so it works despite RLS and leaks no address the caller doesn't hold).
export async function platformEmailSet(
  supabase: RpcClient,
  emails: (string | null | undefined)[],
): Promise<Set<string>> {
  const unique = Array.from(new Set(emails.filter((e): e is string => !!e)));
  if (unique.length === 0) return new Set();
  const { data } = await supabase.rpc("platform_actor_emails", { p_emails: unique });
  return new Set(((data ?? []) as { email: string }[]).map((r) => r.email));
}

// The org-safe actor label: platform actors → "Platform", others → their email.
export function maskActor(email: string | null | undefined, platform: Set<string>): string {
  if (email && platform.has(email)) return PLATFORM_ACTOR_LABEL;
  return email ?? "System (automatic)";
}
