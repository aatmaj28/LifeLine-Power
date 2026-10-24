// Battery-runtime timeline core for the PowerPlan Risk Engine.
//
// Pure arithmetic: depletion = start + batteryHours. All inputs are supplied by
// the caller (no clock), so the invariants (depletion >= start, monotonic in
// hours) are directly property-testable.

import type { Result } from "./types";

/** Milliseconds in one hour. */
const MS_PER_HOUR = 3_600_000;

/**
 * A battery-depletion timeline derived from a user-supplied runtime duration and
 * outage-start time. All times are epoch milliseconds.
 */
export interface Timeline {
  /** Outage start, epoch ms. */
  start: number;
  /** Battery runtime duration, in hours. */
  batteryHours: number;
  /** Battery-depletion time, epoch ms. Always >= {@link Timeline.start}. */
  depletion: number;
}

/**
 * Compute the battery-depletion time from a runtime duration in hours and an
 * outage-start time, using only those two supplied inputs (no clock).
 *
 * A negative `batteryHours` is rejected with a `NEGATIVE_DURATION` error and no
 * depletion time is returned. Otherwise the depletion is
 * `outageStart + batteryHours * 3_600_000`, which is never earlier than
 * `outageStart` (since `batteryHours >= 0`) and is non-decreasing in
 * `batteryHours` for a fixed `outageStart`.
 *
 * @param batteryHours Battery runtime duration, in hours. Must be non-negative.
 * @param outageStart Outage start, epoch ms.
 */
export function batteryTimeline(
  batteryHours: number,
  outageStart: number,
): Result<Timeline> {
  if (batteryHours < 0) {
    return {
      ok: false,
      error: {
        code: "NEGATIVE_DURATION",
        field: "batteryHours",
        message: `batteryHours must be non-negative, received ${batteryHours}`,
      },
    };
  }

  const depletion = outageStart + batteryHours * MS_PER_HOUR;

  return {
    ok: true,
    value: {
      start: outageStart,
      batteryHours,
      depletion,
    },
  };
}
