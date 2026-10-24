import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { outageFlagsByZip } from "../outage-flags";
import {
  makeSmallCount,
  type SimulatedOutage,
  type EmpowerDataset,
  type EmpowerZipRecord,
} from "@/lib/risk-engine";

/**
 * Property 12: A ZIP is flagged with an active outage exactly when an active
 * simulated outage matches it.
 *
 * For any set of `SimulatedOutage`s and any `EmpowerDataset`, `outageFlagsByZip`
 * marks a ZIP `hasActiveOutage === true` if and only if some outage with
 * `active === true` matches that ZIP directly (by `zip`) or via its county (by
 * county name or `countyFips`). Inactive outages never raise the flag.
 *
 * Validates: Requirements 8.3
 */
describe("Feature: app, Property 12: A ZIP is flagged with an active outage exactly when an active simulated outage matches it", () => {
  // A small, fixed set of ZIP records with distinct zips and a few shared
  // counties: 02360/02359 share Plymouth (25023); 01960 is Essex (25009).
  const ZIP_SPECS: ReadonlyArray<{
    zip: string;
    county: string;
    countyFips: string;
  }> = [
    { zip: "02360", county: "Plymouth", countyFips: "25023" },
    { zip: "02359", county: "Plymouth", countyFips: "25023" },
    { zip: "01960", county: "Essex", countyFips: "25009" },
  ];

  function makeZipRecord(spec: {
    zip: string;
    county: string;
    countyFips: string;
  }): EmpowerZipRecord {
    return {
      zip: spec.zip,
      county: spec.county,
      countyFips: spec.countyFips,
      medicareBenes: 0,
      powerDependentDme: makeSmallCount(0),
      esrdDialysisAnyDme: 0,
      o2ServicesAnyDme: 0,
      homeHealthAnyDme: 0,
      hospiceAnyDme: 0,
      healthcareSrvcAnyDme: 0,
      pctPowerDependent: 0,
      dataSource: "empower-aggregated-deidentified-medicare",
    };
  }

  // Build the dataset once. Other fields are intentionally empty — the function
  // under test should only read `dataset.zip`.
  const dataset: EmpowerDataset = {
    zip: ZIP_SPECS.map(makeZipRecord),
    county: [],
    monthly: [],
    zipByCode: new Map(),
    zipsByCountyFips: new Map(),
  };

  // The universe of values an outage can target: dataset zips, dataset county
  // names, dataset county FIPS, plus some values that match nothing.
  const matchTargets: ReadonlyArray<{ kind: "zip" | "county"; value: string }> =
    [
      // Direct ZIP matches.
      ...ZIP_SPECS.map((s) => ({ kind: "zip" as const, value: s.zip })),
      // County-name matches.
      { kind: "county" as const, value: "Plymouth" },
      { kind: "county" as const, value: "Essex" },
      // County-FIPS matches.
      { kind: "county" as const, value: "25023" },
      { kind: "county" as const, value: "25009" },
      // Non-matching values (a zip and a county reference that hit nothing).
      { kind: "zip" as const, value: "99999" },
      { kind: "county" as const, value: "Nantucket" },
      { kind: "county" as const, value: "25019" },
    ];

  const outageArb: fc.Arbitrary<SimulatedOutage> = fc
    .record({
      active: fc.boolean(),
      target: fc.constantFrom(...matchTargets),
      start: fc.constant("2026-10-01T18:00:00Z"),
    })
    .map(({ active, target, start }) => {
      const base = {
        active,
        start,
        simulated: true as const,
        dataSource: "simulated" as const,
      };
      return target.kind === "zip"
        ? { ...base, zip: target.value }
        : { ...base, county: target.value };
    });

  // Independent reference implementation of the expected flag for a record.
  function expectedFlag(
    outages: SimulatedOutage[],
    record: EmpowerZipRecord,
  ): boolean {
    return outages.some(
      (o) =>
        o.active === true &&
        (o.zip === record.zip ||
          o.county === record.county ||
          o.county === record.countyFips),
    );
  }

  it("flags a ZIP iff an active outage matches it directly or via county", () => {
    fc.assert(
      fc.property(
        fc.array(outageArb, { minLength: 0, maxLength: 12 }),
        (outages) => {
          const flags = outageFlagsByZip(outages, dataset);

          // Every dataset ZIP is present and equals the independent expectation.
          for (const record of dataset.zip) {
            const expected = expectedFlag(outages, record);
            expect(flags.has(record.zip)).toBe(true);
            expect(flags.get(record.zip)).toBe(expected);
          }

          // The map keys are exactly the dataset ZIPs (no extras, no missing).
          expect(flags.size).toBe(dataset.zip.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("inactive outages never raise the flag", () => {
    fc.assert(
      fc.property(
        // Only inactive outages: no ZIP should ever be flagged true.
        fc.array(
          outageArb.map((o) => ({ ...o, active: false })),
          { minLength: 0, maxLength: 12 },
        ),
        (inactiveOutages) => {
          const flags = outageFlagsByZip(inactiveOutages, dataset);
          for (const record of dataset.zip) {
            expect(flags.get(record.zip)).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
