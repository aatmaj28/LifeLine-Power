// lib/app/planner/outage-flags.ts
//
// Pure helper that turns the simulated-outage layer into a per-ZIP active-outage
// flag for the planner dashboard. Given the validated simulated outages and the
// emPOWER dataset, it returns a Map keyed by every dataset ZIP whose value is
// true exactly when some ACTIVE simulated outage covers that ZIP.
//
// A simulated outage covers a ZIP when either:
//   - it names the ZIP directly (outage.zip === record.zip), or
//   - it names the ZIP's county. The county reference may be a human county NAME
//     (e.g. "Middlesex") or a FIPS code, so we match it against BOTH the record's
//     county name and its county_fips.
//
// Honesty / Property 12: only outages with active === true can set the flag;
// inactive outages never raise it. Every dataset ZIP appears in the map, so a
// ZIP with no matching active outage is explicitly `false` rather than missing.
//
// The function is pure (no clock, no I/O), so the same inputs always produce the
// same map and it is directly property-testable.

import type { SimulatedOutage, EmpowerDataset } from "@/lib/risk-engine";

/**
 * Build a ZIP → hasActiveOutage map for every ZIP in the dataset.
 *
 * `hasActiveOutage` is true iff some outage with `active === true` matches the
 * ZIP directly (by `zip`) or via its county (by county name or `countyFips`).
 * All other dataset ZIPs default to `false`.
 */
export function outageFlagsByZip(
  outages: SimulatedOutage[],
  dataset: EmpowerDataset,
): Map<string, boolean> {
  // Pre-collect the active outages' direct ZIP matches and county references so
  // each dataset ZIP is a couple of O(1) lookups rather than a full scan.
  const activeZips = new Set<string>();
  const activeCountyRefs = new Set<string>();
  for (const outage of outages) {
    if (!outage.active) continue;
    if (outage.zip !== undefined) activeZips.add(outage.zip);
    if (outage.county !== undefined) activeCountyRefs.add(outage.county);
  }

  const flags = new Map<string, boolean>();
  for (const record of dataset.zip) {
    const matched =
      activeZips.has(record.zip) ||
      activeCountyRefs.has(record.county) ||
      activeCountyRefs.has(record.countyFips);
    flags.set(record.zip, matched);
  }

  return flags;
}
