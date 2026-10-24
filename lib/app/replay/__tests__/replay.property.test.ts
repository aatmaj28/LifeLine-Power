import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  affectedZips,
  outageFlagsForFrame,
  parseReplayFile,
  replayCounter,
  statewideTotal,
  type ReplayFrame,
  type ZipLite,
} from "../replay";

/**
 * Property tests for the simulated Storm Replay engine (wow-features,
 * Properties 1-5). Each runs at least 200 iterations.
 */

const RUNS = 200;

const MA_FIPS = [
  "25001", "25003", "25005", "25007", "25009", "25011", "25013",
  "25015", "25017", "25019", "25021", "25023", "25025", "25027",
];
// FIPS codes that no MA ZIP uses: frames may mention them but must never count them.
const UNKNOWN_FIPS = ["25999", "36061", "00000"];

const zipArb: fc.Arbitrary<ZipLite> = fc
  .record({
    zip: fc.integer({ min: 1000, max: 2799 }).map((n) => String(n).padStart(5, "0")),
    countyFips: fc.constantFrom(...MA_FIPS),
    value: fc.oneof(fc.integer({ min: 0, max: 500 }), fc.constant(11)),
  })
  .map(({ zip, countyFips, value }) => ({
    zip,
    countyFips,
    powerDependentDme: { value, masked: value === 11 },
  }));

const zipsArb = fc.uniqueArray(zipArb, { selector: (z) => z.zip, maxLength: 60 });

const frameArb: fc.Arbitrary<ReplayFrame> = fc.record({
  hour: fc.integer({ min: 0, max: 12 }),
  label: fc.string(),
  counties: fc.array(
    fc.record({
      fips: fc.constantFrom(...MA_FIPS, ...UNKNOWN_FIPS),
      status: fc.constantFrom("outage" as const, "restoring" as const),
    }),
    { maxLength: 20 },
  ),
});

/** Independent reference: sum over ZIPs whose county is in active outage. */
function referenceTotal(frame: ReplayFrame, zips: ZipLite[]): number {
  const outage = new Set(frame.counties.filter((c) => c.status === "outage").map((c) => c.fips));
  return zips
    .filter((z) => outage.has(z.countyFips))
    .reduce((s, z) => s + z.powerDependentDme.value, 0);
}

describe("Feature: wow-features, Property 1: Counter equals the sum over affected ZIPs", () => {
  it("total equals the sum of power_dependent_dme over ZIPs in outage counties", () => {
    fc.assert(
      fc.property(frameArb, zipsArb, (frame, zips) => {
        expect(replayCounter(frame, zips).total).toBe(referenceTotal(frame, zips));
      }),
      { numRuns: RUNS },
    );
  });

  it("restoring counties are never counted", () => {
    fc.assert(
      fc.property(frameArb, zipsArb, (frame, zips) => {
        const restoringOnly: ReplayFrame = {
          ...frame,
          counties: frame.counties.map((c) => ({ ...c, status: "restoring" as const })),
        };
        expect(replayCounter(restoringOnly, zips).total).toBe(0);
      }),
      { numRuns: RUNS },
    );
  });
});

describe("Feature: wow-features, Property 2: Counter never exceeds the statewide total", () => {
  it("total <= statewide total for any frame", () => {
    fc.assert(
      fc.property(frameArb, zipsArb, (frame, zips) => {
        expect(replayCounter(frame, zips).total).toBeLessThanOrEqual(statewideTotal(zips));
      }),
      { numRuns: RUNS },
    );
  });

  it("holds even when the ZIP list contains duplicate records", () => {
    fc.assert(
      fc.property(frameArb, zipsArb, (frame, zips) => {
        const doubled = [...zips, ...zips];
        expect(replayCounter(frame, doubled).total).toBeLessThanOrEqual(statewideTotal(doubled));
        expect(replayCounter(frame, doubled)).toEqual(replayCounter(frame, zips));
      }),
      { numRuns: RUNS },
    );
  });
});

describe("Feature: wow-features, Property 3: Replay is deterministic", () => {
  it("same input gives the same output, independent of ZIP order", () => {
    fc.assert(
      fc.property(
        frameArb,
        zipsArb.chain((zips) =>
          fc.shuffledSubarray(zips, { minLength: zips.length, maxLength: zips.length }).map(
            (shuffled) => ({ zips, shuffled }),
          ),
        ),
        (frame, { zips, shuffled }) => {
          expect(replayCounter(frame, zips)).toEqual(replayCounter(frame, zips));
          expect(replayCounter(frame, shuffled)).toEqual(replayCounter(frame, zips));
          expect(affectedZips(frame, shuffled).map((z) => z.zip)).toEqual(
            affectedZips(frame, zips).map((z) => z.zip),
          );
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe("Feature: wow-features, Property 4: Only known ZIPs are counted", () => {
  it("every affected ZIP is a member of the input list", () => {
    fc.assert(
      fc.property(frameArb, zipsArb, (frame, zips) => {
        const known = new Set(zips);
        for (const z of affectedZips(frame, zips)) expect(known.has(z)).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it("frames naming only unknown counties count nothing", () => {
    fc.assert(
      fc.property(zipsArb, fc.subarray(UNKNOWN_FIPS, { minLength: 1 }), (zips, fips) => {
        const frame: ReplayFrame = {
          hour: 1,
          label: "",
          counties: fips.map((f) => ({ fips: f, status: "outage" as const })),
        };
        expect(replayCounter(frame, zips)).toEqual({ total: 0, zipCount: 0, maskedZipCount: 0 });
      }),
      { numRuns: RUNS },
    );
  });

  it("outage flags exist only for dataset ZIPs", () => {
    fc.assert(
      fc.property(frameArb, zipsArb, (frame, zips) => {
        const flags = outageFlagsForFrame(frame, zips);
        expect([...flags.keys()].sort()).toEqual(zips.map((z) => z.zip).sort());
      }),
      { numRuns: RUNS },
    );
  });
});

describe("Feature: wow-features, Property 5: Masked count is reported", () => {
  it("maskedZipCount equals the number of affected masked ZIPs", () => {
    fc.assert(
      fc.property(frameArb, zipsArb, (frame, zips) => {
        const affected = affectedZips(frame, zips);
        expect(replayCounter(frame, zips).maskedZipCount).toBe(
          affected.filter((z) => z.powerDependentDme.masked).length,
        );
      }),
      { numRuns: RUNS },
    );
  });
});

describe("Simulated replay file", () => {
  const file = parseReplayFile(
    JSON.parse(readFileSync(join(process.cwd(), "data", "sim-storm-replay.json"), "utf8")),
  );

  it("parses, is marked simulated, and has hourly frames 0 to 12", () => {
    expect(file).not.toBeNull();
    expect(file!.simulated).toBe(true);
    expect(file!.frames.map((f) => f.hour)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("starts and ends with no outages and only names MA counties", () => {
    expect(file!.frames[0].counties).toEqual([]);
    expect(file!.frames[12].counties).toEqual([]);
    for (const f of file!.frames) {
      for (const c of f.counties) expect(MA_FIPS).toContain(c.fips);
    }
  });

  it("rejects a file not marked simulated", () => {
    expect(parseReplayFile({ simulated: false, frames: [] })).toBeNull();
    expect(parseReplayFile({ frames: [] })).toBeNull();
  });
});
