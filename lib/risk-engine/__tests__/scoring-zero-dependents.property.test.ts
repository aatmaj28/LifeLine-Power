import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { outreachPriority } from "../scoring";
import type { ScoringConfig, ScoringInputs } from "../scoring";
import type { Severity } from "../types";

/**
 * Property 3: Zero dependents never outscores greater dependents.
 *
 * Validates: Requirements 4.7, 7.4.
 *
 * For any two otherwise-identical `ScoringInputs` where one has
 * `powerDependentDme = 0` and the other has `powerDependentDme > 0`,
 * `outreachPriority` returns `score(zero) <= score(greater)`. Because the
 * dependent contribution is normalized by the FIXED `config.dependentMax` with
 * a non-negative `dependentWeight`, a larger dependent count can only raise (or
 * leave unchanged, once clamped) the score relative to zero dependents — the
 * severity, outage, and config terms are shared and cancel out.
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

/**
 * A valid, well-formed scoring config: positive `dependentMax`, non-negative
 * `dependentWeight`/`outageBonus`, and a strictly-increasing, non-negative
 * `severityWeight`.
 */
const configArb: fc.Arbitrary<ScoringConfig> = fc
  .record({
    dependentMax: fc.double({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
    dependentWeight: fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
    outageBonus: fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
  })
  .map((base) => ({
    ...base,
    severityWeight: {
      none: 0,
      Minor: 1,
      Moderate: 2,
      Severe: 3,
      Extreme: 4,
    },
  }));

describe("Feature: risk-engine, Property 3: Zero dependents never outscores greater dependents", () => {
  it("score(powerDependentDme=0) <= score(powerDependentDme>0) for otherwise-identical inputs", () => {
    let runs = 0;
    fc.assert(
      fc.property(
        zipArb,
        // A strictly-positive dependent count for the "greater" case.
        fc.double({ min: Number.EPSILON, max: 100000, noNaN: true, noDefaultInfinity: true }),
        severityArb,
        fc.boolean(),
        configArb,
        (zip, positiveDependents, severity, hasActiveOutage, config) => {
          runs += 1;

          expect(positiveDependents).toBeGreaterThan(0);

          // The scored ZIP must be known so both calls succeed.
          const knownZips = new Set<string>([zip]);

          const shared = { zip, severity, hasActiveOutage };

          const zeroInputs: ScoringInputs = {
            ...shared,
            powerDependentDme: 0,
          };
          const greaterInputs: ScoringInputs = {
            ...shared,
            powerDependentDme: positiveDependents,
          };

          const zeroResult = outreachPriority(zeroInputs, config, knownZips);
          const greaterResult = outreachPriority(
            greaterInputs,
            config,
            knownZips,
          );

          expect(zeroResult.ok).toBe(true);
          expect(greaterResult.ok).toBe(true);
          if (zeroResult.ok && greaterResult.ok) {
            expect(zeroResult.value.score).toBeLessThanOrEqual(
              greaterResult.value.score,
            );
          }
        },
      ),
      { numRuns: RUNS },
    );
    expect(runs).toBeGreaterThanOrEqual(RUNS);
  });
});
