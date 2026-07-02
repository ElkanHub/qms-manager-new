import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

// T4 (plan §7): the branded certificate PDF, rendered on demand from the
// authoritative record — the record is the certificate; the PDF is its
// rendition, so nothing can drift. RLS scopes access (trainee's own, or
// trainer/QA). The uid on the document verifies against verify_certificate.

function hex(c: string | null | undefined, fallback: [number, number, number]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c ?? "");
  if (!m) return rgb(...fallback);
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export async function GET(_request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const supabase = await createClient();

  const { data: cert } = await supabase
    .from("certificates")
    .select(
      "certificate_uid, trainee_id, document_number, document_title, revision_number, score, issued_at, assigned_by, tenant_id",
    )
    .eq("certificate_uid", uid.toUpperCase())
    .maybeSingle();
  if (!cert) return new Response("Certificate not found", { status: 404 });

  const [{ data: trainee }, { data: branding }] = await Promise.all([
    supabase.from("users").select("full_name, email").eq("id", cert.trainee_id).maybeSingle(),
    supabase
      .from("tenant_branding")
      .select("org_display_name, color_primary, color_secondary")
      .maybeSingle(),
  ]);
  const { data: org } = await supabase.from("organizations").select("name").maybeSingle();

  const orgName = branding?.org_display_name ?? org?.name ?? "Organization";
  const primary = hex(branding?.color_primary, [0.13, 0.15, 0.19]); // neutral defaults until onboarding
  const secondary = hex(branding?.color_secondary, [0.45, 0.48, 0.53]);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const center = (text: string, y: number, font = sans, size = 12, color = secondary) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font, color });
  };

  // Frame
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: primary, borderWidth: 2 });
  page.drawRectangle({ x: 32, y: 32, width: width - 64, height: height - 64, borderColor: secondary, borderWidth: 0.5 });

  center(orgName.toUpperCase(), height - 92, sansBold, 14, primary);
  center("CERTIFICATE OF TRAINING", height - 150, serif, 34, primary);
  center("This certifies that", height - 195, sans, 12);
  center(trainee?.full_name ?? trainee?.email ?? "Trainee", height - 228, serif, 24, primary);
  center("has completed training and passed the assessment for", height - 258, sans, 12);
  center(
    `${cert.document_number ?? "—"} — ${cert.document_title}`,
    height - 288,
    sansBold,
    16,
    primary,
  );
  center(
    `Revision ${cert.revision_number != null ? String(cert.revision_number).padStart(2, "0") : "(pre-release)"}  ·  Score ${cert.score}%`,
    height - 314,
    sans,
    12,
  );
  center(
    `Completed ${new Date(cert.issued_at).toISOString().slice(0, 10)}`,
    height - 338,
    sans,
    11,
  );

  // Verification strip
  center(
    `Certificate ${cert.certificate_uid} — verifiable in the QMS against the training record`,
    72,
    sans,
    9,
  );
  page.drawLine({ start: { x: width / 2 - 120, y: 110 }, end: { x: width / 2 + 120, y: 110 }, color: secondary, thickness: 0.5 });
  center("Quality Management System — controlled training record", 96, sans, 9);

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${cert.certificate_uid}.pdf"`,
    },
  });
}
