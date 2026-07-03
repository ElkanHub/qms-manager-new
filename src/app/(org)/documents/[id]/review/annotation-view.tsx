"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { addReviewComment } from "@/app/(org)/documents/actions";

export type ReviewComment = {
  id: string;
  quote: string;
  prefix: string | null;
  comment: string;
  author: string;
  at: string;
};

// D-REVIEW-ANNOTATE — the highlight-to-comment surface (addendum §3).
// Read-and-annotate ONLY: there is no editing control here and never will be;
// content changes only when the author re-uploads a corrected Word file.
export function AnnotationView({
  versionId,
  paragraphs,
  initialComments,
  canAnnotate,
}: {
  versionId: string;
  paragraphs: string[];
  initialComments: ReviewComment[];
  canAnnotate: boolean;
}) {
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState<{ quote: string; prefix: string; suffix: string; x: number; y: number } | null>(null);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // Selection → capture quote + surrounding context (text anchoring, §3.2).
  function onMouseUp() {
    if (!canAnnotate) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) return;
    const range = sel.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) return;
    const quote = range.toString().trim();
    if (quote.length < 3) return;

    const before = range.cloneRange();
    before.selectNodeContents(containerRef.current);
    before.setEnd(range.startContainer, range.startOffset);
    const prefix = before.toString().slice(-60);
    const after = range.cloneRange();
    after.selectNodeContents(containerRef.current);
    after.setStart(range.endContainer, range.endOffset);
    const suffix = after.toString().slice(0, 60);

    const rect = range.getBoundingClientRect();
    const host = containerRef.current.getBoundingClientRect();
    setDraft({ quote, prefix, suffix, x: rect.left - host.left, y: rect.bottom - host.top + 8 });
    setText("");
  }

  function commit() {
    if (!draft) return;
    startTransition(async () => {
      const res = await addReviewComment({
        versionId,
        quote: draft.quote,
        prefix: draft.prefix,
        suffix: draft.suffix,
        comment: text,
      });
      if (res.ok) {
        setComments((cur) => [...cur, res.comment]);
        setDraft(null);
        window.getSelection()?.removeAllRanges();
        toast.success("Comment committed.");
      } else toast.error(res.error);
    });
  }

  // Render each paragraph with committed highlights marked and numbered. A
  // comment pins to the first paragraph whose text contains its quote (with
  // the stored prefix as the tiebreaker when the quote repeats).
  const pinned = new Set<string>();
  const paragraphMarks: { text: string; marks: { start: number; end: number; n: number }[] }[] =
    paragraphs.map((p) => ({ text: p, marks: [] }));
  comments.forEach((c, i) => {
    let target = -1;
    let offset = -1;
    for (let pi = 0; pi < paragraphs.length; pi++) {
      const idx = paragraphs[pi].indexOf(c.quote);
      if (idx >= 0) {
        const tail = (c.prefix ?? "").slice(-20);
        if (target < 0 || (tail && paragraphs[pi].slice(Math.max(0, idx - 20), idx).includes(tail.trim().slice(0, 10)))) {
          target = pi;
          offset = idx;
          if (!tail) break;
        }
      }
    }
    if (target >= 0) {
      paragraphMarks[target].marks.push({ start: offset, end: offset + c.quote.length, n: i + 1 });
      pinned.add(c.id);
    }
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <div
          ref={containerRef}
          onMouseUp={onMouseUp}
          className={`max-h-[36rem] space-y-3 overflow-y-auto rounded-lg border bg-card p-6 text-sm leading-relaxed ${
            canAnnotate ? "cursor-text selection:bg-primary/20" : ""
          }`}
        >
          {paragraphMarks.map((p, pi) => (
            <p key={pi}>
              {p.marks.length === 0
                ? p.text
                : (() => {
                    const sorted = [...p.marks].sort((a, b) => a.start - b.start);
                    const out: React.ReactNode[] = [];
                    let cursor = 0;
                    sorted.forEach((m, mi) => {
                      if (m.start > cursor) out.push(p.text.slice(cursor, m.start));
                      out.push(
                        <mark key={mi} className="rounded bg-[var(--status-pending,#eab308)]/25 px-0.5">
                          {p.text.slice(Math.max(m.start, cursor), m.end)}
                          <sup className="ml-0.5 font-semibold text-primary">{m.n}</sup>
                        </mark>,
                      );
                      cursor = Math.max(cursor, m.end);
                    });
                    if (cursor < p.text.length) out.push(p.text.slice(cursor));
                    return out;
                  })()}
            </p>
          ))}
        </div>

        {draft && (
          <Card
            className="absolute z-10 w-80 max-w-full shadow-lg"
            style={{ left: Math.min(draft.x, 400), top: draft.y }}
          >
            <CardContent className="space-y-2 p-3">
              <p className="line-clamp-2 text-xs italic text-muted-foreground">“{draft.quote}”</p>
              <Textarea
                autoFocus
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What's wrong with this passage?"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={commit} disabled={pending || !text.trim()}>
                  {pending ? <Loader2 className="animate-spin" /> : <MessageSquarePlus />}
                  Commit
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Review comments panel (§3.3) — what travels back to the author */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">
          Review comments {comments.length > 0 && `(${comments.length})`}
        </h3>
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canAnnotate
              ? "Highlight a passage above to attach a comment to it."
              : "No review comments on this draft."}
          </p>
        ) : (
          <ol className="space-y-2">
            {comments.map((c, i) => (
              <li key={c.id} className="rounded-md border p-3 text-sm">
                <p className="italic text-muted-foreground">
                  <sup className="mr-1 font-semibold not-italic text-primary">{i + 1}</sup>
                  “{c.quote}”
                  {!pinned.has(c.id) && (
                    <span className="ml-2 text-xs not-italic">(passage not found in this extract)</span>
                  )}
                </p>
                <p className="mt-1">{c.comment}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.author} · {c.at}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
