import { describe, it, expect } from "vitest";
import fc from "fast-check";

/**
 * Smoke test confirming the Vitest runner and fast-check generator wiring are
 * functional. Asserts that a single property executes across generated inputs.
 */
describe("risk-engine test tooling", () => {
  it("runs a fast-check property", () => {
    let runs = 0;
    fc.assert(
      fc.property(fc.integer(), (n) => {
        runs += 1;
        return n + 0 === n;
      }),
    );
    expect(runs).toBeGreaterThan(0);
  });
});
