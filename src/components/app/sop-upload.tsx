"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileUp, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadSop } from "@/app/(org)/documents/upload-actions";

// The one upload widget for SOP content (intake + draft re-upload). Primary
// path: pick a Word file → it lands in OUR storage (tracked against the
// tenant's cap) and the hidden content_ref carries the storage ref. Secondary
// (collapsed): link an externally hosted file. Word-only either way — the
// server enforces it regardless.
export function SopUpload({
  name = "content_ref",
  defaultValue = "",
}: {
  name?: string;
  defaultValue?: string;
}) {
  const [ref, setRef] = useState(defaultValue);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(!!defaultValue && !defaultValue.startsWith("storage:"));
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onPick(file: File) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadSop(fd);
      if (res.ok) {
        setRef(res.ref);
        setFileName(file.name);
        toast.success(`${file.name} uploaded (${(res.bytes / 1024 / 1024).toFixed(1)} MB).`);
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={ref} />
      <input
        ref={fileRef}
        type="file"
        accept=".docx,.doc"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <FileUp />}
          {pending ? "Uploading…" : "Upload Word file"}
        </Button>
        {fileName ? (
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-[var(--status-effective,#16a34a)]" />
            {fileName}
          </span>
        ) : ref.startsWith("storage:") ? (
          <span className="text-sm text-muted-foreground">A file is already attached.</span>
        ) : null}
        <button
          type="button"
          onClick={() => setShowUrl((s) => !s)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          <Link2 className="size-3" />
          or link an external file
        </button>
      </div>
      {showUrl && (
        <Input
          value={ref.startsWith("storage:") ? "" : ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="https://… (.docx / .doc)"
          className="font-mono text-xs"
        />
      )}
      <p className="text-xs text-muted-foreground">
        Word only (.docx / .doc). Uploads count against your organization&apos;s storage.
      </p>
    </div>
  );
}
