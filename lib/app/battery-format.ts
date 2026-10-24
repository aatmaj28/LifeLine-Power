// lib/app/battery-format.ts
//
// Pure, plain-language presenter for a battery-depletion Timeline. Given a
// Timeline from the risk engine (start + depletion in epoch ms, plus the
// user-entered batteryHours), it renders one calm sentence a resident can read:
//
//   "If power goes out at 6 PM, your battery covers about 4 hours, until
//    about 10 PM. Based on what you entered."
//
// The function is pure: it never reads the clock. It formats the timestamps it
// is given with a deterministic Intl.DateTimeFormat, so the same Timeline always
// produces the same string. The window end derives from `depletion`, which the
// engine guarantees is never earlier than `start`, so the sentence is always
// well-ordered.

import type { Timeline } from "@/lib/risk-engine";

/** Milliseconds in one hour. */
const MS_PER_HOUR = 3_600_000;

/**
 * Deterministic clock-time formatter. A fixed locale and options mean the output
 * does not depend on the host's default locale, so the presenter is stable and
 * property-testable. Times render as a friendly local clock time: a whole hour
 * shows as "6 PM", a partial hour shows as "10:30 PM".
 */
const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Format an epoch-ms timestamp as a friendly clock time. Whole hours drop the
 * ":00" so they read as "6 PM" rather than "6:00 PM"; partial hours keep the
 * minutes, e.g. "10:30 PM".
 */
function formatClockTime(epochMs: number): string {
  const parts = TIME_FORMAT.formatToParts(new Date(epochMs));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "";
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const clock = minute === "00" ? hour : `${hour}:${minute}`;
  return dayPeriod ? `${clock} ${dayPeriod}` : clock;
}

/**
 * Round a battery runtime to a friendly "about N hours" phrase. Durations under
 * an hour read as "less than an hour"; one hour reads "about 1 hour"; otherwise
 * the hours are rounded to the nearest whole number.
 */
function formatDuration(batteryHours: number): string {
  if (batteryHours < 1) {
    return "less than an hour";
  }
  const rounded = Math.round(batteryHours);
  const unit = rounded === 1 ? "hour" : "hours";
  return `about ${rounded} ${unit}`;
}

/**
 * Render a plain-language sentence describing a battery-depletion
 * {@link Timeline}, followed by the caller-supplied "based on what you entered"
 * label.
 *
 * Pure formatting only: the given `timeline.start` and `timeline.depletion`
 * (epoch ms) are formatted with a deterministic formatter and no clock is read.
 * The window end is derived from `depletion`, which the engine guarantees is
 * never before `start`, so the rendered window is always well-ordered.
 *
 * @param timeline A Timeline produced by the risk engine's `batteryTimeline`.
 * @param copy     The fixed per-language label to append, e.g.
 *                 `{ basedOnInputLabel: "Based on what you entered." }`.
 */
export function formatBatteryTimeline(
  timeline: Timeline,
  copy: { basedOnInputLabel: string },
): string {
  const startTime = formatClockTime(timeline.start);
  const endTime = formatClockTime(timeline.depletion);
  const duration = formatDuration(timeline.batteryHours);

  const sentence =
    `If power goes out at ${startTime}, your battery covers ` +
    `${duration}, until about ${endTime}.`;

  return `${sentence} ${copy.basedOnInputLabel}`;
}
