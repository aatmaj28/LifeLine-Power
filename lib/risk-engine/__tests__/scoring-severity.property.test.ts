import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { outreachPriority } from "../scoring";
import type { ScoringConfig, ScoringInputs } from "../scoring";
import { SEVERITY_ORDER } from "../alert-loader";
import type { Severity } from "../types";

/**
 * Property 2: Severity is non-decreasing in score.
 *
 * For any two `ScoringInputs` that are identical except for `severity`, and any
 * valid `ScoringConfig` with strictly-increasing severity weights,
 * `outreachPriority` returns a score for the higher-severity input that is
 * greater than or equal to the score for the lower-severity input.
 *
 * Function under test: `outreachPriority`.
 *
 * Validates: Requirements 4.3, 4.6, 7.3.
 */

const RUNS = 200;

const ALL_SEVERITIES: Severity[] = [
  "none",
  "Minor",
  "Moderate",
  "Severe",
  "Extreme",
];

/** Generator for one of the five engine severities. */
const severityArb: fc.Arbitrary<Severity> = fc.constantFrom(...ALL_SEVERITIES);

/** A syntactic ZIP string (5 digits, leading zeros allowed). */
const zipArb = fc
  .integer({ min: 0, max: 99999 })
  .map((n) => String(n).padStart(5, "0"));

/**
 * A valid `ScoringConfig` whose `severityWeight` is STRICTLY increasing across
 * none < Minor < Moderate < Severe < Extreme. We draw a non-negative base and
 * four strictly-positive steps, then accumulate them in severity order so each
 * successive weight exceeds the previous.
 */
const configArb: fc.Arbitrary<ScoringConfig> = fc
  .record({
    dependentMax: fc.double({ min: 1, max: 10_000, noNaN: true }),
    dependentWeight: fc.double({ min: 0, max: 10, noNaN: true }),
    outageBonus: fc.double({ min: 0, max: 10, noNaN: true }),
    base: fc.double({ min: 0, max: 10, noNaN: true }),
    steps: fc.array(
      fc.double({
        min: Number.EPSILON,
        max: 10,
        noNaN: true,
        noDefaultInfinity: true,
      }),
      { minLength: 4, maxLength: 4 },
    ),
  })
  .map(({ dependentMax, dependentWeight, outageBonus, base, steps }) => {
    // Accumulate strictly-positive steps so weights strictly increase.
    let running = base;
    const weights: number[] = [running];
    for (const step of steps) {
      running += step;
      weights.push(running);
    }
    const severityWeight = {
      none: weights[0],
      Minor: weights[1],
      Moderate: weights[2],
      Severe: weights[3],
      Extreme: weights[4],
    } as Record<Severity, number>;

    return {
      dependentMax,
      dependentWeight,
      outageBonus,
      severityWeight,
    };
  });

describe("Feature: risk-engine, Property 2: Severity is non-decreasing in score", () => {
  it("scores the higher-severity input at least as high as the lower-severity input, all else equal", () => {
    let runs = 0;
    fc.assert(
      fc.property(
        zipArb,
        // Two independently-generated severities; ordered below into (lower, higher).
        severityArb,
        severityArb,
        // Signals held constant between the two scorings.
        fc.double({ min: 0, max: 10_000, noNaN: true }),
        fc.boolean(),
        configArb,
        (zip, sevA, sevB, powerDependentDme, hasActiveOutage, config) => {
          runs += 1;

          // Order the pair by the known severity ordering into (lower, higher).
          const [lower, higher] =
            SEVERITY_ORDER[sevA] <= SEVERITY_ORDER[sevB]
              ? [sevA, sevB]
              : [sevB, sevA];

          // ZIP is in knownZips so both scorings are ok:true.
          const knownZips = new Set([zip]);

          // Identical except for severity; everything else fixed.
          const lowerInputs: ScoringInputs = {
            zip,
            powerDependentDme,
            severity: lower,
            hasActiveOutage,
          };
          const higherInputs: ScoringInputs = {
            zip,
            powerDependentDme,
            severity: higher,
            hasActiveOutage,
          };

          const lowerResult = outreachPriority(lowerInputs, config, knownZips);
          const higherResult = outreachPriority(higherInputs, config, knownZips);

          expect(lowerResult.ok).toBe(true);
          expect(higherResult.ok).toBe(true);
          if (lowerResult.ok && higherResult.ok) {
            // score(higher severity) >= score(lower severity)
            expect(higherResult.value.score).toBeGreaterThanOrEqual(
              lowerResult.value.score,
            );
          }
        },
      ),
      { numRuns: RUNS },
    );
    expect(runs).toBeGreaterThanOrEqual(RUNS);
  });
});
