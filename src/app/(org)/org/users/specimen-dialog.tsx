"use client";

import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InitialsSignature } from "@/components/app/initials-signature";

export type SpecimenRow = {
  id: string;
  name: string;
  jobTitle: string | null;
  signature: string | null; // data URL
  source: string | null;
};

// The SIGNATURE SPECIMEN — every person with their two signatures (the drawn/
// uploaded one and the auto-generated initials). This is the reference sheet
// for tracing who did what: when a signature appears on a document, this is
// where it's matched to a person.
export function SpecimenDialog({ rows }: { rows: SpecimenRow[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PenLine />
          Specimen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Signature specimen</DialogTitle>
          <DialogDescription>
            Everyone&apos;s recorded signature and auto-generated initials — the reference for
            matching signatures on documents to people.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}</p>
                {r.jobTitle && <p className="truncate text-xs text-muted-foreground">{r.jobTitle}</p>}
              </div>
              {r.signature ? (
                // eslint-disable-next-line @next/next/no-img-element -- small data URL
                <img
                  src={r.signature}
                  alt={`Signature of ${r.name}`}
                  className="h-14 w-32 rounded-md border bg-white object-contain px-1"
                  title={r.source ? `Captured: ${r.source}` : undefined}
                />
              ) : (
                <span className="flex h-14 w-32 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                  Not captured
                </span>
              )}
              <InitialsSignature fullName={r.name} className="h-14 min-w-24 text-xl" />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
