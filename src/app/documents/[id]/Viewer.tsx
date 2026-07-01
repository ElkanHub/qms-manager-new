"use client";

import { useState } from "react";

// The read-surface viewer. The renderer is a coupling seam resolved server-side
// (ms_online default, internal PDF alternate). If the configured renderer fails to
// load, we fall back to the internal rendition so reading never breaks.
export function Viewer({ renderer, renditionRef }: { renderer: string; renditionRef: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!renditionRef) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-dashed border-neutral-300 text-sm text-neutral-500">
        No rendition prepared for this version yet.
      </div>
    );
  }

  const effective = failed ? "internal" : renderer;
  const src =
    effective === "ms_online"
      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(renditionRef)}`
      : renditionRef; // internal: serve the locked PDF/rendition directly

  return (
    <div>
      <iframe
        src={src}
        title="Document"
        onError={() => setFailed(true)}
        className="h-[36rem] w-full rounded-lg border border-neutral-200 bg-white"
      />
      <p className="mt-1 text-xs text-neutral-400">
        Renderer: {effective}
        {failed && " (fell back from the configured renderer)"}
      </p>
    </div>
  );
}
