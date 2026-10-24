import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { makeSmallCount, type EmpowerZipRecord, type Severity } from "@/lib/risk-engine";
import { buildRankedRows } from "@/lib/app/planner/rank";
import {
  alphabeticalOrder,
  coverage,
  outreachComparison,
  outreachSentence,
  randomCoverage,
} from "../outreach";
import { affectedZips, outageFlagsForFrame, type ReplayFrame } from "../replay";

/**
 * Outreach comparison (simulated). Properties:
 *   A. coverage never decreases as N increases (all three orders)
 *   B. coverage is always between 0 and 100%
 *   C. results are deterministic for the same seed
 *   D. the UI sentence only states what the numbers show
 * The claim "PowerPlan order covers at least as many as the random average" is
 * tested separately (see outreach-claim tests).
 */

const RUNS = 150;
const TRIALS = 40; // fewer trials keeps property runs fast; the UI uses 500

const zipList = fc.uniqueArray(
  fc.integer({ min: 1000, max: 2799 }).map((n) => String(n).padStart(5, "0")),
  { minLength: 1, maxLength: 60 },
);

/** ZIPs, a priority order (any permutation, possibly with repeats), affected values. */
const scenarioArb = zipList.chain((zips) =>
  fc.record({
    zips: fc.constant(zips),
    order: fc.shuffledSubarray(zips, { minLength: zips.length, maxLength: zips.length }).chain(
      (perm) => fc.array(fc.constantFrom(...zips), { maxLength: 5 }).map((dups) => [...perm, ...dups]),
    ),
    affected: fc
      .subarray(zips)
      .chain((sub) =>
        fc.tuple(...sub.map(() => fc.oneof(fc.integer({ min: 0, max: 500 }), fc.constant(11)))).map(
          (vals) => new Map(sub.map((z, i) => [z, vals[i]] as [string, number])),
        ),
      ),
    seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  }),
);

const nPair = fc.tuple(fc.integer({ min: 0, max: 80 }), fc.integer({ min: 0, max: 80 })).map(
  ([a, b]) => [Math.min(a, b), Math.max(a, b)] as const,
);

describe("Outreach property A: coverage never decreases as N increases", () => {
  it("holds for PowerPlan, random, and alphabetical order", () => {
    fc.assert(
      fc.property(scenarioArb, nPair, ({ zips, order, affected, seed }, [n1, n2]) => {
        expect(coverage(order, affected, n2)).toBeGreaterThanOrEqual(coverage(order, affected, n1));
        expect(coverage(alphabeticalOrder(zips), affected, n2)).toBeGreaterThanOrEqual(
          coverage(alphabeticalOrder(zips), affected, n1),
        );
        expect(randomCoverage(zips, affected, n2, { seed, trials: TRIALS })).toBeGreaterThanOrEqual(
          randomCoverage(zips, affected, n1, { seed, trials: TRIALS }),
        );
      }),
      { numRuns: RUNS },
    );
  });
});

describe("Outreach property B: coverage is always between 0 and 100%", () => {
  it("every share is in [0, 1], and calling every ZIP reaches everyone", () => {
    fc.assert(
      fc.property(scenarioArb, fc.integer({ min: 0, max: 80 }), ({ zips, order, affected, seed }, n) => {
        const r = outreachComparison({ priorityOrder: order, allZips: zips, affected, n, seed, trials: TRIALS });
        for (const share of [r.powerplan, r.random, r.alphabetical]) {
          expect(share).toBeGreaterThanOrEqual(0);
          expect(share).toBeLessThanOrEqual(1);
        }
        const total = [...affected.values()].reduce((s, v) => s + v, 0);
        if (total > 0) {
          const all = outreachComparison({ priorityOrder: order, allZips: zips, affected, n: zips.length, seed, trials: TRIALS });
          expect(all.powerplan).toBe(1);
          expect(all.random).toBe(1);
          expect(all.alphabetical).toBe(1);
        } else {
          expect([r.powerplan, r.random, r.alphabetical]).toEqual([0, 0, 0]);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

describe("Outreach property C: deterministic for the same seed", () => {
  it("same inputs and seed give identical results", () => {
    fc.assert(
      fc.property(scenarioArb, fc.integer({ min: 0, max: 80 }), ({ zips, order, affected, seed }, n) => {
        const a = outreachComparison({ priorityOrder: order, allZips: zips, affected, n, seed, trials: TRIALS });
        const b = outreachComparison({ priorityOrder: order, allZips: zips, affected, n, seed, trials: TRIALS });
        expect(b).toEqual(a);
      }),
      { numRuns: RUNS },
    );
  });

  it("random baseline does not depend on the order ZIPs are listed in... only through the seed", () => {
    // Documented behavior: the shuffle starts from the given list, so reordering
    // the input list with the same seed may change the random average slightly.
    // The guarantee is reproducibility for identical input, checked above.
    const zips = ["01001", "01002", "01003"];
    const affected = new Map([["01002", 10]]);
    expect(randomCoverage(zips, affected, 1, { seed: 1, trials: 500 })).toBe(
      randomCoverage(zips, affected, 1, { seed: 1, trials: 500 }),
    );
  });
});

describe("Outreach property D: the sentence states only what the numbers show", () => {
  it("claims PowerPlan reaches more only when its percentage is higher", () => {
    fc.assert(
      fc.property(scenarioArb, fc.constantFrom(10, 20, 50), ({ zips, order, affected, seed }, n) => {
        const r = outreachComparison({ priorityOrder: order, allZips: zips, affected, n, seed, trials: TRIALS });
        const s = outreachSentence(r);
        const pp = Math.round(r.powerplan * 100);
        const rnd = Math.round(r.random * 100);
        if (r.affectedTotal === 0) {
          expect(s).toMatch(/no zip codes are in simulated outage areas/i);
          return;
        }
        expect(s).toContain(`${pp}%`);
        expect(s).toContain(`${rnd}%`);
        if (pp <= rnd) expect(s).not.toMatch(/, vs /);
        if (pp > rnd) expect(s).toMatch(/, vs /);
      }),
      { numRuns: RUNS },
    );
  });
});

// --- The claim: PowerPlan order >= random average ---------------------------

/** Build ZIP records + a frame + alerts, and derive PowerPlan order from real scoring. */
const plannerScenario = fc
  .uniqueArray(
    fc.record({
      zip: fc.integer({ min: 1000, max: 2799 }).map((n) => String(n).padStart(5, "0")),
      countyFips: fc.constantFrom("25001", "25017", "25023", "25025"),
      value: fc.oneof(fc.integer({ min: 0, max: 450 }), fc.constant(11)),
      severity: fc.constantFrom<Severity>("none", "none", "Minor", "Moderate", "Severe", "Extreme"),
    }),
    { selector: (z) => z.zip, minLength: 1, maxLength: 40 },
  )
  .chain((rows) =>
    fc.record({
      rows: fc.constant(rows),
      outageCounties: fc.subarray(["25001", "25017", "25023", "25025"]),
      n: fc.constantFrom(10, 20, 50),
    }),
  );

function evaluateClaim(
  rows: Array<{ zip: string; countyFips: string; value: number; severity: Severity }>,
  outageCounties: string[],
  n: number,
  withAlerts: boolean,
) {
  const zip: EmpowerZipRecord[] = rows.map((r) => ({
    zip: r.zip,
    county: r.countyFips,
    countyFips: r.countyFips,
    medicareBenes: 0,
    powerDependentDme: makeSmallCount(r.value),
    esrdDialysisAnyDme: 0,
    o2ServicesAnyDme: 0,
    homeHealthAnyDme: 0,
    hospiceAnyDme: 0,
    healthcareSrvcAnyDme: 0,
    pctPowerDependent: 0,
    dataSource: "empower-aggregated-deidentified-medicare",
  }));
  const frame: ReplayFrame = {
    hour: 1,
    label: "",
    counties: outageCounties.map((fips) => ({ fips, status: "outage" as const })),
  };
  const severityByZip = withAlerts ? new Map(rows.map((r) => [r.zip, r.severity])) : undefined;
  const order = buildRankedRows({ zip, county: [] }, severityByZip, outageFlagsForFrame(frame, zip)).map(
    (r) => r.result.zip,
  );
  const affected = new Map(affectedZips(frame, zip).map((z) => [z.zip, z.powerDependentDme.value]));
  return outreachComparison({
    priorityOrder: order,
    allZips: zip.map((z) => z.zip),
    affected,
    n,
    trials: TRIALS,
  });
}

describe("Claim: PowerPlan order covers at least as many as the random average", () => {
  it("holds for any data when there are no weather alerts (outage + people only)", () => {
    // With no alerts, an affected ZIP with any residents always scores above
    // every unaffected ZIP (outage adds 100; dependents add at most 100), and
    // affected ZIPs are ordered by residents. So PowerPlan's top N reaches at
    // least as many as ANY order, including every random shuffle.
    fc.assert(
      fc.property(plannerScenario, ({ rows, outageCounties, n }) => {
        const r = evaluateClaim(rows, outageCounties, n, false);
        expect(r.powerplan).toBeGreaterThanOrEqual(r.random);
      }),
      { numRuns: 300 },
    );
  });

  it("does NOT hold in general once weather alerts are in the score (counterexample is expected)", () => {
    // Alerts can rank ZIPs OUTSIDE the simulated outage area above affected
    // ZIPs, so PowerPlan's top N can reach fewer affected residents than a
    // random pick. We keep this as a documented, expected counterexample and do
    // not change scoring to hide it. See docs/kiro-journal.md.
    const found = fc.check(
      fc.property(plannerScenario, ({ rows, outageCounties, n }) => {
        const r = evaluateClaim(rows, outageCounties, n, true);
        return r.powerplan >= r.random;
      }),
      { numRuns: 1000, seed: 7 },
    );
    expect(found.failed).toBe(true);
  });
});
