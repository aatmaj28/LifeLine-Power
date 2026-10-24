import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { isValidBatteryHours } from "../plan-storage";
// Import via the engine barrel (public API). Use a relative path so the test
// resolves under the current Vitest config, which does not map the `@/` alias.
import { batteryTimeline } from "../../risk-engine";

/**
 * Property 3: Battery-hours validation accepts exactly the non-negative values.
 *
 * For any number `h`, the resident battery-hours validator rejects `h` when
 * `h < 0` and accepts `h` when `h >= 0`, consistent with the engine's
 * `NEGATIVE_DURATION` semantics (`batteryTimeline(h, start)` errors iff
 * `h < 0`).
 *
 * Validates: Requirements 4.6
 */
describe("Feature: app, Property 3: Battery-hours validation accepts exactly the non-negative values", () => {
  // Arbitrary finite numbers, mixing negative and non-negative values. Excludes
  // NaN and infinities so `h >= 0` is a well-defined, total classifier.
  const finiteNumber = fc.double({ noNaN: true, noDefaultInfinity: true });

  // Any outage-start time (epoch-ms-like integer) is valid for the engine.
  const outageStart = fc.integer();

  it("accepts exactly the non-negative finite values (isValidBatteryHours(h) === (h >= 0))", () => {
    fc.assert(
      fc.property(finiteNumber, (h) => {
        expect(isValidBatteryHours(h)).toBe(h >= 0);
      }),
      { numRuns: 200 },
    );
  });

  it("agrees with the engine: batteryTimeline(h, start).ok === isValidBatteryHours(h) for finite h", () => {
    fc.assert(
      fc.property(finiteNumber, outageStart, (h, start) => {
        expect(batteryTimeline(h, start).ok).toBe(isValidBatteryHours(h));
      }),
      { numRuns: 200 },
    );
  });
});
