// The auto-generated initials signature: derived from the name at render time
// (never stored, so it can never drift from the directory). Shown wherever the
// drawn signature is shown — capture preview, the specimen, and as a signing
// option alongside the drawn signature.
export function initialsOf(fullName: string | null | undefined): string {
  return (fullName ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 3)
    .join(".");
}

export function InitialsSignature({
  fullName,
  className = "",
}: {
  fullName: string | null | undefined;
  className?: string;
}) {
  const initials = initialsOf(fullName);
  return (
    <span
      className={`inline-flex h-16 min-w-28 items-center justify-center rounded-md border bg-card px-4 text-2xl italic ${className}`}
      style={{ fontFamily: "'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', cursive" }}
      aria-label={`Initials signature ${initials}`}
    >
      {initials ? `${initials}.` : "—"}
    </span>
  );
}
