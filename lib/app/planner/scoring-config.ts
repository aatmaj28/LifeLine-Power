// lib/app/planner/scoring-config.ts
//
// Pure builder for the ScoringConfig the planner feeds into `outreachPriority`.
//
// The one piece of real derivation here is `dependentMax`: scoring normalizes
// each ZIP's dependent count against a FIXED dataset-wide maximum, so the whole
// dataset must agree on one denominator. We take the max `power_dependent_dme`
// across the ZIP records (Property 11) and guard it to at least 1 so it is
// always positive and safe to divide by, even for an empty or all-zero dataset.
//
// Why ZIP records only: scores are computed per ZIP, so the denominator must be
// on the same scale as the numerator. Earlier this also included county totals,
// which made the largest county (Middlesex, 6,985) the denominator and capped a
// ZIP's dependents factor at about 6 points out of 100, so the number of people
// barely moved a score. With the largest ZIP (444) as the denominator, the
// largest ZIP gets the full 100 points from dependents alone, on the same scale
// as one alert level (100) and an active outage (100). See docs/decisions.md.
//
// The remaining fields are simple, honest defaults: a unit dependent weight, a
// strictly-increasing severity weight in SEVERITY_ORDER (none < Minor <
// Moderate < Severe < Extreme), and a unit outage bonus. This function is pure
// and reads nothing but the dataset it is given.

import type {
  EmpowerDataset,
  ScoringConfig,
  Severity,
} from "@/lib/risk-engine";

/**
 * Strictly-increasing, non-negative weight per severity, ordered to match
 * SEVERITY_ORDER (none < Minor < Moderate < Severe < Extreme). A more severe
 * alert always contributes strictly more than a less severe one.
 */
const SEVERITY_WEIGHT: Record<Severity, number> = {
  none: 0,
  Minor: 1,
  Moderate: 2,
  Severe: 3,
  Extreme: 4,
};

/**
 * Build the {@link ScoringConfig} for a loaded emPOWER dataset.
 *
 * `dependentMax` is the maximum `power_dependent_dme.value` across the dataset's
 * ZIP records, guarded to at least 1 so it is positive and safe as a
 * normalization denominator. `severityWeight` is strictly increasing in
 * SEVERITY_ORDER. `dependentWeight` and `outageBonus` are sensible positive /
 * non-negative defaults.
 *
 * Pure: derives everything from `dataset.zip` and reads no external state.
 *
 * @param dataset The loaded emPOWER dataset.
 * @returns A {@link ScoringConfig} with a positive, dataset-wide `dependentMax`.
 */
export function buildScoringConfig(
  dataset: Pick<EmpowerDataset, "zip">,
): ScoringConfig {
  let maxDependents = 0;
  for (const record of dataset.zip) {
    if (record.powerDependentDme.value > maxDependents) {
      maxDependents = record.powerDependentDme.value;
    }
  }

  return {
    // Guard to at least 1: always positive, safe denominator even for an empty
    // or all-zero dataset.
    dependentMax: Math.max(1, maxDependents),
    dependentWeight: 1,
    severityWeight: SEVERITY_WEIGHT,
    outageBonus: 1,
  };
}
