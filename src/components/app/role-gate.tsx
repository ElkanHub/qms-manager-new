import { getMyRoles } from "@/lib/auth";

// Render-only convenience (UI_BUILD_PLAN §3, §8): shows children when the current
// user holds any of the given roles. This is NOT authority — every action is
// re-checked server-side. Hiding a control here is ergonomics, not security.
export async function RoleGate({
  anyOf,
  children,
}: {
  anyOf: string[];
  children: React.ReactNode;
}) {
  const roles = await getMyRoles();
  if (!roles.some((r) => anyOf.includes(r))) return null;
  return <>{children}</>;
}
