import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { batteryTimeline } from "../battery";

/**
 * Property 6: Battery depletion is never before start and is monotonic in hours.
 *
 * For any non-negative `batteryHours` and any `outageStart`, `batteryTimeline`
 * returns a `depletion >= outageStart`; and for any two non-negative durations
 * `h1 <= h2` with the same `outageStart`, `depletion(h1) <= depletion(h2)`.
 *
 * Validates: Requirements 6.2, 6.3, 7.7
 */
describe("Feature: risk-engine, Property 6: Battery depletion is never before start and is monotonic in hours", () => {
  // Non-negative runtime durations in hours; bounded to a large but finite range
  // (well beyond any realistic battery runtime) to keep arithmetic finite.
  const nonNegativeHours = fc.double({
    min: 0,
    max: 1_000_000,
    noNaN: true,
    noDefaultInfinity: true,
  });

  // Outage start as an epoch-ms-like integer; any value is valid.
  const outageStart = fc.integer();

  it("returns a depletion time that is never earlier than the outage start", () => {
    fc.assert(
      fc.property(nonNegativeHours, outageStart, (batteryHours, start) => {
        const result = batteryTimeline(batteryHours, start);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.depletion).toBeGreaterThanOrEqual(start);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("is monotonic in hours: longer runtime never depletes earlier for the same start", () => {
    fc.assert(
      fc.property(
        nonNegativeHours,
        nonNegativeHours,
        outageStart,
        (a, b, start) => {
          const h1 = Math.min(a, b);
          const h2 = Math.max(a, b);

          const r1 = batteryTimeline(h1, start);
          const r2 = batteryTimeline(h2, start);

          expect(r1.ok).toBe(true);
          expect(r2.ok).toBe(true);
          if (r1.ok && r2.ok) {
            expect(r2.value.depletion).toBeGreaterThanOrEqual(
              r1.value.depletion,
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
