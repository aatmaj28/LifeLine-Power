import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { batteryTimeline } from "../battery";
import { outreachPriority } from "../scoring";
import type { ScoringConfig, ScoringInputs } from "../scoring";
import type { Severity } from "../types";

/**
 * Property 7: Invalid inputs are rejected, never silently scored.
 *
 * Validates: Requirements 4.8, 6.4, 7.8.
 *
 * - For any ZIP absent from the known-ZIP set, `outreachPriority` returns an
 *   error result (`UNKNOWN_ZIP`) and no score.
 * - For any negative `batteryHours`, `batteryTimeline` returns an error result
 *   (`NEGATIVE_DURATION`) and no depletion time.
 */

const RUNS = 100;

/** Generator for a syntactic ZIP string (5 digits, leading zeros allowed). */
const zipArb = fc
  .integer({ min: 0, max: 99999 })
  .map((n) => String(n).padStart(5, "0"));

const severityArb: fc.Arbitrary<Severity> = fc.constantFrom(
  "none",
  "Minor",
  "Moderate",
  "Severe",
  "Extreme",
);

/** A valid, well-formed scoring config (positive denominator, non-negative weights). */
const configArb: fc.Arbitrary<ScoringConfig> = fc.record({
  dependentMax: fc.double({ min: 1, max: 10000, noNaN: true }),
  dependentWeight: fc.double({ min: 0, max: 10, noNaN: true }),
  outageBonus: fc.double({ min: 0, max: 10, noNaN: true }),
}).map((base) => ({
  ...base,
  severityWeight: {
    none: 0,
    Minor: 1,
    Moderate: 2,
    Severe: 3,
    Extreme: 4,
  },
}));

describe("Feature: risk-engine, Property 7: invalid inputs are rejected, never silently scored", () => {
  it("rejects a ZIP absent from knownZips with UNKNOWN_ZIP and no score", () => {
    let runs = 0;
    fc.assert(
      fc.property(
        zipArb,
        // A set of other ZIPs that will have the target ZIP removed from it.
        fc.array(zipArb, { maxLength: 10 }),
        fc.double({ min: 0, max: 10000, noNaN: true }),
        severityArb,
        fc.boolean(),
        configArb,
        (zip, otherZips, powerDependentDme, severity, hasActiveOutage, config) => {
          runs += 1;

          // Build a knownZips set that explicitly excludes the target ZIP.
          const knownZips = new Set(otherZips);
          knownZips.delete(zip);

          const inputs: ScoringInputs = {
            zip,
            powerDependentDme,
            severity,
            hasActiveOutage,
          };

          const result = outreachPriority(inputs, config, knownZips);

          // Must be rejected: an error result with UNKNOWN_ZIP and no value.
          expect(result.ok).toBe(false);
          if (result.ok === false) {
            expect(result.error.code).toBe("UNKNOWN_ZIP");
          }
          expect("value" in result).toBe(false);
        },
      ),
      { numRuns: RUNS },
    );
    expect(runs).toBeGreaterThanOrEqual(RUNS);
  });

  it("rejects negative batteryHours with NEGATIVE_DURATION and no depletion time", () => {
    let runs = 0;
    fc.assert(
      fc.property(
        // Strictly-negative battery hours.
        fc
          .double({ min: Number.EPSILON, max: 100000, noNaN: true })
          .map((h) => -h),
        // Any outage-start time (epoch ms).
        fc.integer({ min: 0, max: 4_102_444_800_000 }),
        (batteryHours, outageStart) => {
          runs += 1;

          expect(batteryHours).toBeLessThan(0);

          const result = batteryTimeline(batteryHours, outageStart);

          // Must be rejected: an error result with NEGATIVE_DURATION and no value.
          expect(result.ok).toBe(false);
          if (result.ok === false) {
            expect(result.error.code).toBe("NEGATIVE_DURATION");
          }
          expect("value" in result).toBe(false);
        },
      ),
      { numRuns: RUNS },
    );
    expect(runs).toBeGreaterThanOrEqual(RUNS);
  });
});
