import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { outreachPriority } from "../scoring";
import type { ScoringConfig, ScoringInputs } from "../scoring";
import type { Severity } from "../types";

/**
 * Property 1: Dependent count is non-decreasing in score.
 *
 * For any two `ScoringInputs` that are identical except that the second has a
 * `powerDependentDme` greater than or equal to the first, and any valid
 * `ScoringConfig` and known-ZIP set containing the ZIP, `outreachPriority`
 * returns a score for the second that is >= the score for the first.
 *
 * Validates: Requirements 4.6, 7.2
 */
describe("Feature: risk-engine, Property 1: Dependent count is non-decreasing in score", () => {
  // A ZIP-like 5-digit string (leading zeros allowed); placed in knownZips so
  // both calls are ok:true.
  const zipArb = fc
    .integer({ min: 0, max: 99999 })
    .map((n) => n.toString().padStart(5, "0"));

  // Shared severity for both inputs; any valid severity level.
  const severityArb: fc.Arbitrary<Severity> = fc.constantFrom(
    "none",
    "Minor",
    "Moderate",
    "Severe",
    "Extreme",
  );

  // A valid ScoringConfig: positive dependentMax, non-negative dependentWeight,
  // strictly-increasing severityWeight (none < Minor < Moderate < Severe <
  // Extreme), and non-negative outageBonus.
  const configArb: fc.Arbitrary<ScoringConfig> = fc
    .record({
      dependentMax: fc.double({
        min: 1,
        max: 1_000_000,
        noNaN: true,
        noDefaultInfinity: true,
      }),
      dependentWeight: fc.double({
        min: 0,
        max: 1_000,
        noNaN: true,
        noDefaultInfinity: true,
      }),
      outageBonus: fc.double({
        min: 0,
        max: 1_000,
        noNaN: true,
        noDefaultInfinity: true,
      }),
      // Five strictly-positive steps that accumulate into a strictly-increasing
      // weight per severity.
      steps: fc.tuple(
        fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }),
      ),
    })
    .map(({ dependentMax, dependentWeight, outageBonus, steps }) => {
      const [s0, s1, s2, s3, s4] = steps;
      const none = s0;
      const minor = none + s1;
      const moderate = minor + s2;
      const severe = moderate + s3;
      const extreme = severe + s4;
      return {
        dependentMax,
        dependentWeight,
        outageBonus,
        severityWeight: {
          none,
          Minor: minor,
          Moderate: moderate,
          Severe: severe,
          Extreme: extreme,
        },
      } satisfies ScoringConfig;
    });

  // Non-negative dependent counts.
  const dependentArb = fc.integer({ min: 0, max: 1_000_000 });

  it("a greater-or-equal dependent count never lowers the score", () => {
    fc.assert(
      fc.property(
        zipArb,
        severityArb,
        fc.boolean(),
        configArb,
        dependentArb,
        dependentArb,
        (zip, severity, hasActiveOutage, config, a, b) => {
          const low = Math.min(a, b);
          const high = Math.max(a, b);

          const knownZips = new Set<string>([zip]);

          const base: Omit<ScoringInputs, "powerDependentDme"> = {
            zip,
            severity,
            hasActiveOutage,
          };

          const resLow = outreachPriority(
            { ...base, powerDependentDme: low },
            config,
            knownZips,
          );
          const resHigh = outreachPriority(
            { ...base, powerDependentDme: high },
            config,
            knownZips,
          );

          // The ZIP is known, so both calls must succeed.
          expect(resLow.ok).toBe(true);
          expect(resHigh.ok).toBe(true);
          if (resLow.ok && resHigh.ok) {
            expect(resHigh.value.score).toBeGreaterThanOrEqual(
              resLow.value.score,
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
