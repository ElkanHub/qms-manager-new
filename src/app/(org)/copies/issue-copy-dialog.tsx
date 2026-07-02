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

// Issue a controlled copy against a document's effective version (calls issueCopy).
// Options = documents with an effective current version only.
export function IssueCopyDialog({
  options,
}: {
  options: { versionId: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
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
      <DialogContent>
        <form action={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Issue controlled copy</DialogTitle>
            <DialogDescription>
              Register a physical/controlled distribution against a document&apos;s effective version.
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
            <Label htmlFor="holder">Holder</Label>
            <Input
              id="holder"
              name="holder"
              required
              placeholder="Shop floor, parts desk, contract site…"
            />
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
