// lib/app/planner/aggregate.ts
//
// Pure county-level aggregation for the planner dashboard. Given the per-ZIP
// emPOWER records, it sums each ZIP's power-dependent DME count into a total
// per county, keyed by the engine's `countyFips`. The choropleth uses these
// totals to color the 14 MA counties.
//
// The function is pure and deterministic: it only reads the records it is
// given, in order, and returns a fresh Map each call.

import type { EmpowerZipRecord } from "@/lib/risk-engine";

/**
 * Sum `power_dependent_dme.value` per `county_fips`.
 *
 * Groups the given ZIP records by `countyFips` and returns, for each county,
 * the sum of its ZIPs' `powerDependentDme.value`. Counties with no records are
 * simply absent from the result.
 */
export function aggregateCountyDependents(
  zipRecords: EmpowerZipRecord[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const record of zipRecords) {
    const prior = totals.get(record.countyFips) ?? 0;
    totals.set(record.countyFips, prior + record.powerDependentDme.value);
  }
  return totals;
}
