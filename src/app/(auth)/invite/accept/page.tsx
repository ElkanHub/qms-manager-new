import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { acceptInvitation } from "./actions";
import { SignInToAccept } from "./AcceptButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

// S-INVITE-ACCEPT — the landing an invitee reaches from their one-time link.
// Authenticate with Google; the account is created already bound to the invite's
// tenant/org/department/role. Expired/used invites show a clear dead-end — never
// a signup fallback (rule 0.5).
export default async function AcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) return <DeadEnd message="This invitation link is missing its token." />;

  const authUser = await getAuthUser();

  if (authUser) {
    const result = await acceptInvitation(token);
    if (result.ok) redirect("/mfa"); // now bound → set up mandatory MFA
    return <DeadEnd message={result.error} />;
  }

  return (
    <Shell title="You're invited">
      <p className="text-sm text-muted-foreground">
        Sign in with the Google account this invitation was sent to. Your account will be
        created and bound to your organization automatically.
      </p>
      <SignInToAccept token={token} />
    </Shell>
  );
}

function DeadEnd({ message }: { message: string }) {
  return (
    <Shell title="This invitation can't be used">
      <Alert variant="destructive">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <p className="text-sm text-muted-foreground">
        There is no public sign-up. Ask your organization&apos;s QA to send a new invitation.
      </p>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center justify-center p-8">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </main>
  );
}
