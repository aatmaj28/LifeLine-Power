import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { aggregateCountyDependents } from "../aggregate";
import { makeSmallCount, type EmpowerZipRecord } from "@/lib/risk-engine";

/**
 * Property 10: County aggregation equals the sum of its ZIPs and is monotonic.
 *
 * For any list of EmpowerZipRecords, `aggregateCountyDependents` yields, per
 * county FIPS, a total equal to the sum of its ZIP records'
 * `powerDependentDme.value`; and increasing any single ZIP's
 * `powerDependentDme.value` never decreases that ZIP's county total.
 *
 * Validates: Requirements 7.1
 */
describe("Feature: app, Property 10: County aggregation equals the sum of its ZIPs and is monotonic", () => {
  // A small set of MA county FIPS codes so records collide into shared buckets.
  const countyFipsArb = fc.constantFrom("25001", "25017", "25027");

  // Non-negative integer dependent counts, kept bounded so repeated sums stay
  // well inside safe-integer range across large arrays.
  const valueArb = fc.integer({ min: 0, max: 1_000_000 });

  // A minimal record carrying only the fields the function reads. The cast
  // documents that other EmpowerZipRecord fields are irrelevant here.
  const recordArb: fc.Arbitrary<EmpowerZipRecord> = fc
    .record({ countyFips: countyFipsArb, value: valueArb })
    .map(
      ({ countyFips, value }) =>
        ({
          countyFips,
          powerDependentDme: makeSmallCount(value),
        }) as unknown as EmpowerZipRecord,
    );

  it("Test A (sum): each county total equals the sum of its ZIP values", () => {
    fc.assert(
      fc.property(fc.array(recordArb, { maxLength: 50 }), (records) => {
        const totals = aggregateCountyDependents(records);

        // Independently compute the expected sum per county FIPS.
        const expected = new Map<string, number>();
        for (const record of records) {
          const prior = expected.get(record.countyFips) ?? 0;
          expected.set(
            record.countyFips,
            prior + record.powerDependentDme.value,
          );
        }

        // Same set of county keys, and every total matches.
        expect(new Set(totals.keys())).toEqual(new Set(expected.keys()));
        for (const [fips, total] of totals) {
          expect(total).toBe(expected.get(fips));
        }
      }),
      { numRuns: 200 },
    );
  });

  it("Test B (monotonic): increasing one ZIP's value never lowers its county total", () => {
    fc.assert(
      fc.property(
        // A non-empty array so there is a record to bump.
        fc.array(recordArb, { minLength: 1, maxLength: 50 }),
        valueArb,
        fc.integer({ min: 0, max: 1_000_000 }),
        (records, delta, rawIndex) => {
          const index = rawIndex % records.length;
          const target = records[index];
          const fips = target.countyFips;

          const before = aggregateCountyDependents(records);

          // Rebuild the array with the chosen record's value increased by delta.
          const bumped = records.map((record, i) =>
            i === index
              ? ({
                  ...record,
                  powerDependentDme: makeSmallCount(
                    record.powerDependentDme.value + delta,
                  ),
                } as unknown as EmpowerZipRecord)
              : record,
          );
          const after = aggregateCountyDependents(bumped);

          // The bumped record's county total never decreases.
          expect(after.get(fips)!).toBeGreaterThanOrEqual(before.get(fips)!);
        },
      ),
      { numRuns: 200 },
    );
  });
});
