"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InitialsSignature } from "@/components/app/initials-signature";
import { applySignature } from "../actions";

// The signing moment: the signer chooses WHICH of their two recorded
// signatures applies — the drawn one or the auto-generated initials — states
// the Part-11 meaning, and signs. The server enforces role, SoD, and that a
// signature is on file.
export function SignaturePicker({
  ccId,
  fullName,
  mySignature,
}: {
  ccId: string;
  fullName: string;
  mySignature: string | null; // data URL of the drawn/uploaded signature
}) {
  const [kind, setKind] = useState<"drawn" | "initials">(mySignature ? "drawn" : "initials");
  const [meaning, setMeaning] = useState("");
  const [pending, startTransition] = useTransition();

  if (!mySignature)
    return (
      <Alert>
        <PenLine className="size-4" />
        <AlertDescription>
          You have no signature on file — capture one under{" "}
          <Link href="/settings" className="font-medium underline underline-offset-4">
            Settings → Signature
          </Link>{" "}
          before signing.
        </AlertDescription>
      </Alert>
    );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Sign with</Label>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setKind("drawn")}
            className={`rounded-md border p-2 transition-colors ${
              kind === "drawn" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            }`}
            aria-pressed={kind === "drawn"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- small data URL */}
            <img src={mySignature} alt="Your signature" className="h-12 rounded bg-white object-contain px-1" />
            <span className="mt-1 block text-xs text-muted-foreground">Full signature</span>
          </button>
          <button
            type="button"
            onClick={() => setKind("initials")}
            className={`rounded-md border p-2 transition-colors ${
              kind === "initials" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            }`}
            aria-pressed={kind === "initials"}
          >
            <InitialsSignature fullName={fullName} className="h-12 min-w-20 text-xl" />
            <span className="mt-1 block text-xs text-muted-foreground">Initials</span>
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="meaning">Meaning of signature (e.g. reviewed / approved)</Label>
        <Input id="meaning" value={meaning} onChange={(e) => setMeaning(e.target.value)} required />
      </div>

      <Button
        type="button"
        disabled={pending || !meaning.trim()}
        onClick={() =>
          startTransition(async () => {
            const fd = new FormData();
            fd.set("cc", ccId);
            fd.set("meaning", meaning.trim());
            fd.set("signature_kind", kind);
            const res = await applySignature(fd);
            if (res.ok) toast.success("Signed.");
            else toast.error(res.error);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <PenLine />}
        Sign (my required role)
      </Button>
    </div>
  );
}
