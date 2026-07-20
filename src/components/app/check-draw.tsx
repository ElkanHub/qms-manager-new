// Success check that draws itself (SVG stroke, ~380ms). Decorative — aria-hidden.
// Used on form success (ActionForm) and the e-signature confirmation. Snaps to
// drawn under prefers-reduced-motion (handled in globals.css).
export function CheckDraw({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" className="animate-check-draw" />
    </svg>
  );
}
