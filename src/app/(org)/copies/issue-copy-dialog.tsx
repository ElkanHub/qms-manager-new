"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { issueCopy } from "@/app/(org)/oversight/actions";
import { CopyTypePicker } from "./request-copy-dialog";

// QA's direct issue — request and issuance in one act (QA is both requester and
// release authority). Same register entry, same stamps, same audit as the queue.
export function IssueCopyDialog({
  options,
  formats,
  allowUncontrolled,
}: {
  options: { versionId: string; label: string }[];
  formats: string[];
  allowUncontrolled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copyType, setCopyType] = useState("controlled");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await issueCopy(formData);
      if (result.ok) {
        toast.success(result.message ?? "Copy issued.");
        setOpen(false);
        setError(null);
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Issue copy
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form action={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Issue controlled copy</DialogTitle>
            <DialogDescription>
              Direct issue against a document&apos;s effective version — lands on the register
              exactly like a fulfilled request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="version_id">Document</Label>
            <select
              id="version_id"
              name="version_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {options.map((o) => (
                <option key={o.versionId} value={o.versionId}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Copy type</Label>
            <CopyTypePicker
              name="copy_type"
              value={copyType}
              onChange={setCopyType}
              allowUncontrolled={allowUncontrolled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="format">Format</Label>
            <select
              id="format"
              name="format"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {formats.map((f) => (
                <option key={f} value={f}>
                  {f === "paper" ? "Paper" : "PDF"}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="holder">Holder / destination</Label>
            <Input
              id="holder"
              name="holder"
              required
              placeholder="Shop floor, parts desk, contract site…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="purpose">Purpose (optional)</Label>
            <Input id="purpose" name="purpose" placeholder="Why this copy is being distributed" />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending || options.length === 0}>
              {pending && <Loader2 className="animate-spin" />}
              Issue copy
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
