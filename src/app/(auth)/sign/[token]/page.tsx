import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneSignPad } from "./phone-sign-pad";

// The phone side of the QR signing flow. No session — the single-use,
// 15-minute token in the URL is the credential; the save is validated,
// burned, and audited server-side as the token's owner.
export default async function PhoneSign({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Sign with your finger</CardTitle>
          <CardDescription>
            Draw your signature below — it attaches to your profile on the screen you scanned from.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhoneSignPad token={token} />
        </CardContent>
      </Card>
    </main>
  );
}
