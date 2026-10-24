import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { buildScoringConfig } from "../scoring-config";
import {
  SEVERITY_ORDER,
  makeSmallCount,
  type EmpowerDataset,
  type EmpowerZipRecord,
  type EmpowerCountyRecord,
  type Severity,
} from "@/lib/risk-engine";

/**
 * Property 11: Scoring config uses the dataset-wide max and a strictly-increasing
 * severity weight.
 *
 * For any `EmpowerDataset`, `buildScoringConfig(dataset).dependentMax` equals the
 * maximum `power_dependent_dme.value` across the dataset's ZIP records (and is
 * positive), and `severityWeight` is strictly increasing in `SEVERITY_ORDER`
 * (none < Minor < Moderate < Severe < Extreme).
 *
 * Updated with the normalization fix (docs/decisions.md): the max used to
 * include county totals, which put the denominator on the wrong scale. County
 * records are still generated here to prove they no longer affect the max.
 *
 * Validates: Requirements 7.7
 */
describe("Feature: app, Property 11: Scoring config uses the dataset-wide max and a strictly-increasing severity weight", () => {
  // Severities ordered by SEVERITY_ORDER: none < Minor < Moderate < Severe < Extreme.
  const ORDERED_SEVERITIES = (
    Object.keys(SEVERITY_ORDER) as Severity[]
  ).sort((a, b) => SEVERITY_ORDER[a] - SEVERITY_ORDER[b]);

  // Non-negative integer dependent counts.
  const valueArb = fc.integer({ min: 0, max: 1_000_000 });

  // Minimal ZIP record: only powerDependentDme matters to buildScoringConfig,
  // but we build a full-shape record so the dataset is valid.
  const zipRecordArb: fc.Arbitrary<EmpowerZipRecord> = valueArb.map(
    (value) => ({
      zip: "00000",
      county: "Test",
      countyFips: "00000",
      medicareBenes: 0,
      powerDependentDme: makeSmallCount(value),
      esrdDialysisAnyDme: 0,
      o2ServicesAnyDme: 0,
      homeHealthAnyDme: 0,
      hospiceAnyDme: 0,
      healthcareSrvcAnyDme: 0,
      pctPowerDependent: 0,
      dataSource: "empower-aggregated-deidentified-medicare",
    }),
  );

  const countyRecordArb: fc.Arbitrary<EmpowerCountyRecord> = valueArb.map(
    (value) => ({
      countyFips: "00000",
      county: "Test",
      medicareBenes: 0,
      powerDependentDme: makeSmallCount(value),
      esrdDialysisAnyDme: 0,
      o2ServicesAnyDme: 0,
      homeHealthAnyDme: 0,
      hospiceAnyDme: 0,
      healthcareSrvcAnyDme: 0,
      pctPowerDependent: 0,
      dataSource: "empower-aggregated-deidentified-medicare",
    }),
  );

  // A minimal dataset: zip + county records, everything else empty since
  // buildScoringConfig reads only zip and county.
  const datasetArb: fc.Arbitrary<EmpowerDataset> = fc
    .record({
      zip: fc.array(zipRecordArb, { maxLength: 20 }),
      county: fc.array(countyRecordArb, { maxLength: 20 }),
    })
    .map(({ zip, county }) => ({
      zip,
      county,
      monthly: [],
      zipByCode: new Map(),
      zipsByCountyFips: new Map(),
    }));

  it("dependentMax is the positive dataset-wide max and severityWeight is strictly increasing in SEVERITY_ORDER", () => {
    fc.assert(
      fc.property(datasetArb, (dataset) => {
        const config = buildScoringConfig(dataset);

        // Expected dependent max across ZIP records only, guarded to at least 1
        // so it is always positive. County totals must not change it.
        const values = dataset.zip.map((r) => r.powerDependentDme.value);
        const rawMax = values.length === 0 ? 0 : Math.max(...values);
        const expectedMax = Math.max(1, rawMax);

        expect(config.dependentMax).toBe(expectedMax);
        expect(config.dependentMax).toBeGreaterThanOrEqual(1);
        const withoutCounties: EmpowerDataset = { ...dataset, county: [] };
        expect(buildScoringConfig(withoutCounties).dependentMax).toBe(
          config.dependentMax,
        );

        // severityWeight strictly increasing along SEVERITY_ORDER.
        for (let i = 1; i < ORDERED_SEVERITIES.length; i++) {
          const prev = config.severityWeight[ORDERED_SEVERITIES[i - 1]];
          const curr = config.severityWeight[ORDERED_SEVERITIES[i]];
          expect(curr).toBeGreaterThan(prev);
        }

        // Explicit ordering per the named severities.
        expect(config.severityWeight.none).toBeLessThan(
          config.severityWeight.Minor,
        );
        expect(config.severityWeight.Minor).toBeLessThan(
          config.severityWeight.Moderate,
        );
        expect(config.severityWeight.Moderate).toBeLessThan(
          config.severityWeight.Severe,
        );
        expect(config.severityWeight.Severe).toBeLessThan(
          config.severityWeight.Extreme,
        );
      }),
      { numRuns: 200 },
    );
  });
});
