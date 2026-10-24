"use client";

// components/StormReplay.tsx
//
// Controls and counter for the SIMULATED Storm Replay on /planner.
//
// - Controlled: the page owns `hour` so the map and ranked list update from the
//   same frame. This component only asks for hour changes.
// - Never autoplays. Play advances one frame every 1.5 seconds and stops at the
//   last frame. With prefers-reduced-motion, Play advances exactly one frame per
//   press and never starts a timer.
// - Everything here is labeled "Simulated". The counter is computed by the pure
//   replay engine (lib/app/replay/replay.ts) and announced politely.
// - No evacuation timing, no medical advice: the frame labels describe only the
//   simulated storm's position and simulated outages.

import { useEffect, useId, useRef, useState } from "react";

import {
  clampHour,
  replayCounter,
  type ReplayFile,
  type ZipLite,
} from "@/lib/app/replay/replay";

import DataSourceBadge from "./DataSourceBadge";
import OutreachComparison from "./OutreachComparison";
import SimulatedBadge from "./SimulatedBadge";

export const PLAY_INTERVAL_MS = 1500;

export interface StormReplayProps {
  file: ReplayFile;
  /** ZIP records the counter sums over (the loaded emPOWER dataset). */
  zips: readonly ZipLite[];
  hour: number;
  onHourChange: (hour: number) => void;
  /** ZIPs in PowerPlan priority order for the current frame (for the comparison). */
  priorityOrder?: readonly string[];
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const buttonClass =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md border border-storm-navy bg-white px-4 py-2 text-base font-semibold text-storm-navy hover:bg-mist disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400";

export function StormReplay({ file, zips, hour, onHourChange, priorityOrder }: StormReplayProps) {
  const last = file.frames.length - 1;
  const current = clampHour(hour, file.frames.length);
  const frame = file.frames[current];
  const count = replayCounter(frame, zips);

  const [playing, setPlaying] = useState(false);
  const sliderId = useId();
  const tipId = useId();
  const hourRef = useRef(current);
  hourRef.current = current;

  // Timer-driven play. Stops itself at the last frame.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = hourRef.current + 1;
      if (next > last) {
        setPlaying(false);
        return;
      }
      onHourChange(next);
      if (next >= last) setPlaying(false);
    }, PLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [playing, last, onHourChange]);

  const play = () => {
    if (prefersReducedMotion()) {
      // One frame per press, no animation, no timer.
      onHourChange(current >= last ? 0 : current + 1);
      return;
    }
    if (current >= last) onHourChange(0);
    setPlaying(true);
  };

  const step = (delta: number) => {
    setPlaying(false);
    onHourChange(clampHour(current + delta, file.frames.length));
  };

  return (
    <section
      aria-labelledby="replay-heading"
      className="flex flex-col gap-4 rounded-lg border-2 border-power-amber bg-white p-5"
    >
      <div
        role="note"
        className="flex flex-wrap items-center gap-3 rounded-md bg-power-amber/15 px-4 py-2 text-base font-semibold text-storm-navy"
      >
        <SimulatedBadge />
        <span>
          Simulated storm replay. This is not a forecast and not real outage data.
        </span>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 id="replay-heading" className="text-xl font-bold text-storm-navy">
          Storm Replay (Simulated)
        </h3>
        {file.updatedAt ? (
          <DataSourceBadge source="simulated" updatedAt={file.updatedAt} />
        ) : null}
      </div>

      {/* The big counter. */}
      <div aria-live="polite" className="flex flex-col gap-1">
        <p className="text-lg text-storm-navy">
          <span className="font-semibold">Simulated hour {current} of {last}:</span>{" "}
          {frame.label}
        </p>
        <p className="flex flex-wrap items-baseline gap-x-3 text-storm-navy">
          <span className="text-5xl font-bold tabular-nums">
            About {count.total.toLocaleString("en-US")}
          </span>
          <span className="text-xl">
            power dependent Medicare residents in simulated outage areas
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span>
          {count.zipCount} ZIP codes affected in this simulated hour.
        </span>
        {count.maskedZipCount > 0 ? (
          <span className="group relative inline-flex">
            <button
              type="button"
              aria-describedby={tipId}
              onKeyDown={(e) => {
                // WCAG 1.4.13: the tooltip can be dismissed without moving focus away.
                if (e.key === "Escape") e.currentTarget.blur();
              }}
              className="inline-flex min-h-[44px] items-center gap-1 rounded px-2 text-sm font-semibold text-storm-navy underline decoration-dotted underline-offset-4"
            >
              <span aria-hidden="true">ⓘ</span> Why &ldquo;about&rdquo;?
            </button>
            {/* Hoverable (no pointer-events-none) so the pointer can move onto it. */}
            <span
              id={tipId}
              role="tooltip"
              className="absolute bottom-full left-0 z-10 hidden w-72 rounded-md border border-storm-navy bg-white p-3 text-sm text-storm-navy shadow-md group-focus-within:block group-hover:block"
            >
              {count.maskedZipCount} of these ZIPs are reported as &ldquo;11 or
              fewer&rdquo; to protect privacy. Each one is counted as up to 11, so
              the true number may be a little lower.
            </span>
          </span>
        ) : null}
      </div>

      {/* Controls. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            onClick={() => step(-1)}
            disabled={current <= 0}
          >
            <span aria-hidden="true">⏮</span> Step back
          </button>
          {playing ? (
            <button type="button" className={buttonClass} onClick={() => setPlaying(false)}>
              <span aria-hidden="true">⏸</span> Pause
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-md bg-power-amber px-5 py-2 text-base font-bold text-power-ink hover:brightness-95"
              onClick={play}
            >
              <span aria-hidden="true">▶</span> Play
            </button>
          )}
          <button
            type="button"
            className={buttonClass}
            onClick={() => step(1)}
            disabled={current >= last}
          >
            Step forward <span aria-hidden="true">⏭</span>
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={sliderId} className="text-base font-semibold text-storm-navy">
            Simulated hour
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={last}
            step={1}
            value={current}
            aria-valuetext={`Simulated hour ${current} of ${last}`}
            onChange={(e) => {
              setPlaying(false);
              onHourChange(clampHour(Number(e.target.value), file.frames.length));
            }}
            className="h-11 w-full accent-[#1B2A41]"
          />
          <div aria-hidden="true" className="flex justify-between text-sm text-slate-600">
            <span>Hour 0</span>
            <span>Hour {last}</span>
          </div>
        </div>
      </div>

      {priorityOrder ? (
        <OutreachComparison frame={frame} zips={zips} priorityOrder={priorityOrder} />
      ) : null}
    </section>
  );
}

export default StormReplay;
