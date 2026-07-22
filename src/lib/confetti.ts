import confetti from "canvas-confetti";

// A brief, one-time celebration burst — reserved for genuinely earned moments
// (training passed, onboarding complete). canvas-confetti already no-ops under
// prefers-reduced-motion via disableForReducedMotion; the guard is belt-and-braces.
export function celebrate() {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  confetti({
    particleCount: 90,
    spread: 72,
    startVelocity: 38,
    ticks: 180,
    origin: { y: 0.6 },
    disableForReducedMotion: true,
  });
}
