import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { batteryTimeline } from "@/lib/risk-engine";
import { formatBatteryTimeline } from "../battery-format";

/**
 * Property 4: Battery timeline presenter is always labeled and well-ordered.
 *
 * For any Timeline produced by `batteryTimeline(hours, start)` with
 * `hours >= 0`, `formatBatteryTimeline(timeline, copy)` renders a non-empty
 * string that contains the caller-supplied `basedOnInputLabel`, and the window
 * it describes is well-ordered: its end (derived from `depletion`) is never
 * before its start, which the engine guarantees via `depletion >= start`.
 *
 * Asserting "end not before start" directly on the formatted clock text is
 * brittle (12-hour clock, locale rounding), so the ordering invariant is
 * asserted on the Timeline the presenter reflects, while the string checks
 * confirm the label is always present.
 *
 * Validates: Requirements 5.3
 */
describe("Feature: app, Property 4: Battery timeline presenter is always labeled and well-ordered", () => {
  // Non-negative runtime durations in hours; finite and NaN-free so the
  // resulting depletion arithmetic stays finite.
  const nonNegativeHours = fc.double({
    min: 0,
    max: 1_000_000,
    noNaN: true,
    noDefaultInfinity: true,
  });

  // Outage start as an epoch-ms integer; any value is a valid start.
  const start = fc.integer();

  const basedOnInputLabel = "based on what you entered";

  it("always contains the label and reflects a well-ordered window", () => {
    fc.assert(
      fc.property(nonNegativeHours, start, (hours, startMs) => {
        const result = batteryTimeline(hours, startMs);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const timeline = result.value;

        // The invariant the presenter reflects: the window end (depletion) is
        // never before its start.
        expect(timeline.depletion).toBeGreaterThanOrEqual(timeline.start);

        const output = formatBatteryTimeline(timeline, { basedOnInputLabel });

        expect(typeof output).toBe("string");
        expect(output.length).toBeGreaterThan(0);
        expect(output).toContain(basedOnInputLabel);
      }),
      { numRuns: 200 },
    );
  });
});
