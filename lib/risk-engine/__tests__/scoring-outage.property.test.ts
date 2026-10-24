import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { outreachPriority } from "../scoring";
import type { ScoringConfig, ScoringInputs } from "../scoring";
import type { Severity } from "../types";

/**
 * Property 4: Adding an active outage never lowers the score.
 *
 * Validates: Requirements 4.4, 4.5, 7.5.
 *
 * For any `ScoringInputs` and valid `ScoringConfig`, the score with
 * `hasActiveOutage = true` is greater than or equal to the score with
 * `hasActiveOutage = false` when all other signals (zip, dependent count,
 * severity, config, known-ZIP set) are held constant; and every returned
 * `Reason` has a non-negative `value` in both results.
 */

const RUNS = 200;

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
 * `dependentWeight`, a strictly-increasing `severityWeight`, and a non-negative
 * `outageBonus`.
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

describe("Feature: risk-engine, Property 4: Adding an active outage never lowers the score", () => {
  it("score(hasActiveOutage=true) >= score(hasActiveOutage=false), all other signals equal; all reasons non-negative", () => {
    let runs = 0;
    fc.assert(
      fc.property(
        zipArb,
        fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
        severityArb,
        configArb,
        (zip, powerDependentDme, severity, config) => {
          runs += 1;

          // Shared known-ZIP set containing the ZIP under test, so neither call
          // is rejected — the only thing that varies is `hasActiveOutage`.
          const knownZips = new Set<string>([zip]);

          const base = {
            zip,
            powerDependentDme,
            severity,
          };

          const withoutOutage: ScoringInputs = { ...base, hasActiveOutage: false };
          const withOutage: ScoringInputs = { ...base, hasActiveOutage: true };

          const resultWithout = outreachPriority(withoutOutage, config, knownZips);
          const resultWith = outreachPriority(withOutage, config, knownZips);

          // Both must produce a score (ok: true).
          expect(resultWithout.ok).toBe(true);
          expect(resultWith.ok).toBe(true);
          if (!resultWithout.ok || !resultWith.ok) return;

          // Adding an active outage never lowers the score.
          expect(resultWith.value.score).toBeGreaterThanOrEqual(
            resultWithout.value.score,
          );

          // Every returned reason has a non-negative value, in both results.
          for (const reason of resultWithout.value.reasons) {
            expect(reason.value).toBeGreaterThanOrEqual(0);
          }
          for (const reason of resultWith.value.reasons) {
            expect(reason.value).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: RUNS },
    );
    expect(runs).toBeGreaterThanOrEqual(RUNS);
  });
});
