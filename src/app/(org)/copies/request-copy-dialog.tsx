"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { requestCopy } from "@/app/(org)/oversight/actions";

// The three copy types, in the requester's language — the type decides what
// happens at the next revision, so the picker explains that up front.
export const COPY_TYPES = [
  {
    value: "controlled",
    label: "Controlled copy",
    hint: "A working copy that must stay current. You'll be asked to return or destroy it when the document revises.",
  },
  {
    value: "display",
    label: "Display copy",
    hint: "Posted at a location (wall, station). Must be pulled the moment the document revises.",
  },
  {
    value: "uncontrolled",
    label: "Uncontrolled copy",
    hint: "Information only — valid on its issue date. Never recalled, clearly stamped as uncontrolled.",
  },
] as const;

export function CopyTypePicker({
  name,
  value,
  onChange,
  allowUncontrolled,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  allowUncontrolled: boolean;
}) {
  const types = COPY_TYPES.filter((t) => allowUncontrolled || t.value !== "uncontrolled");
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={value} />
      {types.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`w-full rounded-md border p-3 text-left transition-colors ${
            value === t.value ? "border-primary bg-primary/5" : "hover:bg-muted/50"
          }`}
        >
          <span className="block text-sm font-medium">{t.label}</span>
          <span className="block text-xs text-muted-foreground">{t.hint}</span>
        </button>
      ))}
    </div>
  );
}

// C-REQUEST — how any department member asks for a copy. There is no print or
// export here (or anywhere): the request is the only path, QA is the only issuer.
export function RequestCopyDialog({
  options,
  formats,
  allowUncontrolled,
}: {
  options: { documentId: string; label: string }[];
  formats: string[];
  allowUncontrolled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copyType, setCopyType] = useState("controlled");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await requestCopy(formData);
      if (result.ok) {
        toast.success(result.message ?? "Request sent.");
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
          <Send />
          Request a copy
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form action={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Request a copy</DialogTitle>
            <DialogDescription>
              Copies leave the system only through QA. Your request goes to their issuance queue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="document_id">Document</Label>
            <select
              id="document_id"
              name="document_id"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {options.map((o) => (
                <option key={o.documentId} value={o.documentId}>
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

          <div className="grid grid-cols-2 gap-3">
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
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" name="quantity" type="number" min={1} max={50} defaultValue={1} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="destination">Destination / holder</Label>
            <Input
              id="destination"
              name="destination"
              required
              placeholder="Granulation room, corridor noticeboard, auditor pack…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="purpose">Purpose</Label>
            <Textarea id="purpose" name="purpose" required rows={2} placeholder="Why this copy is needed" />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending || options.length === 0}>
              {pending && <Loader2 className="animate-spin" />}
              Send to QA
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
