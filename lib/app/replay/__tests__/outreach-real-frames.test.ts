import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { loadEmpowerDataset } from "@/lib/risk-engine";
import { buildRankedRows } from "@/lib/app/planner/rank";
import { OUTREACH_N_OPTIONS, outreachComparison, percent } from "../outreach";
import { affectedZips, outageFlagsForFrame, parseReplayFile } from "../replay";

/**
 * The claim "PowerPlan order covers at least as many residents as the random
 * average" checked on the REAL emPOWER data and the REAL simulated replay frames
 * only, with no live weather alerts (the replay itself has none).
 *
 * In general the claim does not hold once live alerts are in the score; that
 * counterexample is documented in outreach.property.test.ts and the journal.
 * This test also prints the numbers used in the README and journal.
 */
describe("Outreach claim on the real replay frames (Simulated)", () => {
  it("PowerPlan order reaches at least as many as the random average for every frame and N", async () => {
    const loaded = await loadEmpowerDataset();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const dataset = loaded.value;
    const file = parseReplayFile(
      JSON.parse(readFileSync(join(process.cwd(), "data", "sim-storm-replay.json"), "utf8")),
    );
    expect(file).not.toBeNull();

    const allZips = dataset.zip.map((z) => z.zip);
    const table: string[] = [];
    for (const frame of file!.frames) {
      const order = buildRankedRows(dataset, undefined, outageFlagsForFrame(frame, dataset.zip)).map(
        (r) => r.result.zip,
      );
      const affected = new Map(
        affectedZips(frame, dataset.zip).map((z) => [z.zip, z.powerDependentDme.value]),
      );
      for (const n of OUTREACH_N_OPTIONS) {
        const r = outreachComparison({ priorityOrder: order, allZips, affected, n });
        expect(r.powerplan).toBeGreaterThanOrEqual(r.random);
        expect(r.powerplan).toBeGreaterThanOrEqual(r.alphabetical);
        if (r.affectedTotal > 0) {
          table.push(
            `h${frame.hour} N=${n}: PowerPlan ${percent(r.powerplan)}% | random ${percent(r.random)}% | A-Z ${percent(r.alphabetical)}%`,
          );
        }
      }
    }
    console.log(table.join("\n"));
  }, 60_000);
});
