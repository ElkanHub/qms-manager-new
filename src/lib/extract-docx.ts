import "server-only";
import mammoth from "mammoth";

// Server-side text extraction for the HTML annotation view (addendum §2).
// The MS-online renderer is sealed — you can't anchor a comment to a word in
// it — so the review surface extracts the Word file's text into paragraphs.
// Formatting fidelity is deliberately lost here; the faithful view stays the
// MS-online render. https only, tight timeout, hard size cap; .doc (legacy
// binary) isn't extractable — the caller shows the fallback notice.

const MAX_BYTES = 15 * 1024 * 1024;

export async function extractDocxParagraphs(
  ref: string | null,
): Promise<{ paragraphs: string[]; error: string | null }> {
  if (!ref) return { paragraphs: [], error: "No content file on this draft yet." };
  const path = ref.split("?")[0].toLowerCase();
  if (path.endsWith(".doc"))
    return {
      paragraphs: [],
      error: "Legacy .doc files can't be text-extracted — use the faithful view, or re-upload as .docx.",
    };
  if (!path.endsWith(".docx")) return { paragraphs: [], error: "Not a Word (.docx) reference." };
  if (!/^https:\/\//i.test(ref))
    return { paragraphs: [], error: "The content reference must be an https URL to extract." };

  try {
    const res = await fetch(ref, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { paragraphs: [], error: `The file could not be fetched (${res.status}).` };
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_BYTES) return { paragraphs: [], error: "File too large to extract (15 MB cap)." };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES)
      return { paragraphs: [], error: "File too large to extract (15 MB cap)." };
    const { value } = await mammoth.extractRawText({ buffer: buf });
    const paragraphs = value
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (paragraphs.length === 0) return { paragraphs: [], error: "The file contains no extractable text." };
    return { paragraphs, error: null };
  } catch {
    return { paragraphs: [], error: "The file could not be fetched or read as a Word document." };
  }
}
