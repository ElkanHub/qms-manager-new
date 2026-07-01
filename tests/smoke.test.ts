import { describe, it, expect } from "vitest";

// Phase 0 acceptance: the harness runs green on an empty domain (no domain logic yet).
// Real domain tests live in supabase/tests/*.sql (DB substrate) and later app tests.
describe("harness", () => {
  it("runs", () => {
    expect(true).toBe(true);
  });
});
