"use client";

// components/OutreachComparison.tsx
//
// SIMULATED "Outreach comparison" panel inside Storm Replay. For the current
// frame it shows what share of power-dependent residents in simulated outage
// areas are reached by calling the top N ZIPs in three orders. The math is in
// lib/app/replay/outreach.ts; the sentence states only what the numbers show.
//
// Bars pair every value with text (label + percentage), so color is never the
// only signal.

import { useId, useMemo, useState } from "react";

import {
  OUTREACH_N_OPTIONS,
  RANDOM_TRIALS,
  outreachComparison,
  outreachSentence,
  percent,
} from "@/lib/app/replay/outreach";
import { affectedZips, type ReplayFrame, type ZipLite } from "@/lib/app/replay/replay";

import SimulatedBadge from "./SimulatedBadge";

export interface OutreachComparisonProps {
  frame: ReplayFrame;
  zips: readonly ZipLite[];
  /** ZIPs in PowerPlan priority order for this frame (the ranked list). */
  priorityOrder: readonly string[];
}

function Bar({ label, share, accent }: { label: string; share: number; accent?: boolean }) {
  const pct = percent(share);
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3 text-base text-storm-navy">
        <span className={accent ? "font-bold" : undefined}>{label}</span>
        <span className="font-bold tabular-nums">{pct}%</span>
      </div>
      <div aria-hidden="true" className="h-4 w-full overflow-hidden rounded-full border border-slate-300 bg-mist">
        <div
          className={["h-full rounded-full", accent ? "bg-power-amber" : "bg-slate-500"].join(" ")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </li>
  );
}

export function OutreachComparison({ frame, zips, priorityOrder }: OutreachComparisonProps) {
  const [n, setN] = useState<number>(20);
  const groupId = useId();

  const result = useMemo(() => {
    const affected = new Map(affectedZips(frame, zips).map((z) => [z.zip, z.powerDependentDme.value]));
    return outreachComparison({
      priorityOrder,
      allZips: zips.map((z) => z.zip),
      affected,
      n,
    });
  }, [frame, zips, priorityOrder, n]);

  return (
    <section
      aria-labelledby={`${groupId}-heading`}
      className="flex flex-col gap-3 rounded-lg border border-slate-300 bg-white p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h4 id={`${groupId}-heading`} className="text-lg font-bold text-storm-navy">
          Outreach comparison (Simulated)
        </h4>
        <SimulatedBadge />
      </div>

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 w-full text-base text-storm-navy">How many ZIP codes are called?</legend>
        {OUTREACH_N_OPTIONS.map((option) => (
          <label
            key={option}
            className={[
              // The radio is visually hidden, so show its keyboard focus on the label.
              "inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-base has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-power-amber",
              n === option
                ? "border-storm-navy bg-storm-navy font-bold text-white"
                : "border-slate-400 bg-white text-storm-navy",
            ].join(" ")}
          >
            <input
              type="radio"
              name={`${groupId}-n`}
              value={option}
              checked={n === option}
              onChange={() => setN(option)}
              className="sr-only"
            />
            Top {option}
          </label>
        ))}
      </fieldset>

      <p aria-live="polite" className="text-lg text-storm-navy">
        {outreachSentence(result)}
      </p>

      {result.affectedTotal > 0 ? (
        <ul className="flex flex-col gap-3" aria-label={`Share of affected residents reached by calling the top ${n} ZIPs`}>
          <Bar label="PowerPlan priority order" share={result.powerplan} accent />
          <Bar label={`Random order (average of ${RANDOM_TRIALS} shuffles)`} share={result.random} />
          <Bar label="Alphabetical by ZIP" share={result.alphabetical} />
        </ul>
      ) : null}

      <p className="text-sm text-slate-700">
        Share of power dependent Medicare residents in simulated outage areas who
        live in the ZIPs called. Uses the same order as the ranked list below,
        including any live weather alerts. Masked ZIPs count as up to 11.
      </p>
    </section>
  );
}

export default OutreachComparison;
