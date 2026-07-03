import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

// The stamped issue sheet — the physical face of a register entry. QA prints it
// and attaches it to (or emails it with) the copy, so the artifact in the wild
// carries its copy number, revision, type stamp and issuance record. Rendered on
// demand from the register (the record IS the sheet; nothing can drift). When
// the rendition pipeline lands (#7), the full document PDF rides behind this
// page; until then the sheet is the controlled front matter.

function hex(c: string | null | undefined, fallback: [number, number, number]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c ?? "");
  if (!m) return rgb(...fallback);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const DEFAULT_STAMPS: Record<string, string> = {
  controlled: "CONTROLLED COPY — RETURN OR DESTROY ON REVISION",
  display: "DISPLAY COPY — REMOVE WHEN SUPERSEDED",
  uncontrolled: "UNCONTROLLED — FOR INFORMATION ONLY — VALID ON DATE OF ISSUE",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: copy } = await supabase
    .from("copies_register")
    .select(
      "id, copy_number, holder, purpose, copy_type, format, issued_by, issued_at, live_state, revision_number, document_number, title, version_status",
    )
    .eq("id", id)
    .maybeSingle();
  if (!copy) return new Response("Copy not found", { status: 404 });

  const [{ data: branding }, { data: mod }, { data: issuer }] = await Promise.all([
    supabase
      .from("tenant_branding")
      .select("org_display_name, color_primary, color_secondary, color_accent")
      .maybeSingle(),
    supabase.from("tenant_modules").select("config").eq("module_key", "controlled_copies").maybeSingle(),
    copy.issued_by
      ? supabase.from("users").select("full_name, email").eq("id", copy.issued_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const { data: org } = await supabase.from("organizations").select("name").maybeSingle();

  const stamps = ((mod?.config as { stamps?: Record<string, string> } | null)?.stamps ?? {}) as Record<string, string>;
  const stamp = stamps[copy.copy_type] ?? DEFAULT_STAMPS[copy.copy_type] ?? "";

  const orgName = branding?.org_display_name ?? org?.name ?? "Organization";
  const primary = hex(branding?.color_primary, [0.13, 0.15, 0.19]);
  const secondary = hex(branding?.color_secondary, [0.45, 0.48, 0.53]);
  const accent = hex(branding?.color_accent, [0.55, 0.42, 0.05]);
  const isBlockingType = copy.copy_type !== "uncontrolled";

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4 portrait
  const { width, height } = page.getSize();
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Brand band + org
  page.drawRectangle({ x: 0, y: height - 16, width, height: 16, color: primary });
  page.drawText(orgName, { x: 48, y: height - 64, size: 18, font: sansBold, color: primary });
  page.drawText("Controlled copy register — issue sheet", {
    x: 48, y: height - 84, size: 11, font: sans, color: secondary,
  });

  // The stamp — the loudest thing on the page
  const stampSize = 13;
  const stampWidth = sansBold.widthOfTextAtSize(stamp, stampSize);
  const stampX = Math.max(48, (width - stampWidth) / 2);
  page.drawRectangle({
    x: stampX - 14, y: height - 152, width: Math.min(stampWidth + 28, width - 68), height: 34,
    borderColor: isBlockingType ? primary : accent, borderWidth: 2,
  });
  page.drawText(stamp, {
    x: stampX, y: height - 141, size: stampSize, font: sansBold,
    color: isBlockingType ? primary : accent,
  });

  // Copy identity block
  let y = height - 210;
  const row = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), { x: 48, y, size: 8.5, font: sansBold, color: secondary });
    page.drawText(value, { x: 200, y, size: 11.5, font: sans, color: rgb(0.1, 0.1, 0.12) });
    y -= 26;
  };
  row("Document", `${copy.document_number ?? "—"} — ${copy.title}`);
  row("Revision issued", `Rev ${String(copy.revision_number ?? 0).padStart(2, "0")}`);
  if (isBlockingType) row("Copy number", `#${copy.copy_number}`);
  row("Copy type", copy.copy_type.toUpperCase());
  row("Format", copy.format === "pdf" ? "PDF" : "Paper");
  row("Holder / destination", copy.holder);
  if (copy.purpose) row("Purpose", copy.purpose);
  row("Issued by (QA)", issuer?.full_name ?? issuer?.email ?? "—");
  row("Issued at", copy.issued_at ? new Date(copy.issued_at).toUTCString() : "—");

  // Type-specific footer guidance
  y -= 8;
  const note = isBlockingType
    ? "This copy is maintained by the document-control system. When the document revises, QA will recall it — return or destroy it as instructed and it will be reconciled on the register."
    : "This copy is NOT maintained. It was correct on its date of issue only; the current effective version is always the one served inside the system.";
  const words = note.split(" ");
  let line = "";
  for (const w of words) {
    if (sans.widthOfTextAtSize(line + " " + w, 10) > width - 96) {
      page.drawText(line.trim(), { x: 48, y, size: 10, font: sans, color: secondary });
      y -= 15;
      line = w;
    } else line = line + " " + w;
  }
  if (line.trim()) page.drawText(line.trim(), { x: 48, y, size: 10, font: sans, color: secondary });

  page.drawText(`Register entry ${copy.id} — every issuance and reconciliation is on the audit trail.`, {
    x: 48, y: 42, size: 8, font: sans, color: secondary,
  });
  page.drawRectangle({ x: 0, y: 0, width, height: 10, color: primary });

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="copy-${copy.document_number ?? "doc"}-${copy.copy_number}.pdf"`,
    },
  });
}
