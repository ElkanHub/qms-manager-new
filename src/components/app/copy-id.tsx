"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Click-to-copy identifier (UI_BUILD_PLAN §6.4, used in audit + detail headers).
// Shows the (optionally shortened) value in mono; copies the full value.
export function CopyId({
  value,
  label,
  short,
  className,
}: {
  value: string;
  /** Display override; defaults to `short` truncation or the full value. */
  label?: string;
  /** Truncate the displayed value to this many leading chars (full value copied). */
  short?: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const shown = label ?? (short ? `${value.slice(0, short)}…` : value);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded font-mono text-xs text-muted-foreground hover:text-foreground",
        className,
      )}
      aria-label={`Copy ${value}`}
    >
      {shown}
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}
