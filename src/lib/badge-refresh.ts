"use client";

// Tiny client-side event bus for the live sidebar badges. Any successful
// mutation pings it (ActionForm and ReasonDialog do this automatically, so
// every form in the app participates); the sidebar listens and refetches its
// counts immediately — no waiting for the next poll tick.
export const BADGE_EVENT = "qms:badges-changed";

export function pingBadges() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BADGE_EVENT));
}
