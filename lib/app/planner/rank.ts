// lib/app/planner/rank.ts
//
// Shared, pure ranking helper for the planner. The map and the ranked list must
// show the same scores, so both call this one function. It only *calls* the
// engine's scoring API (`outreachPriority`, `rankByPriority`) with the
// dataset-wide config; it does not change how scores are computed.
//
// Display helpers live here too so the popup and the list format scores and
// reasons identically.

import type {
  EmpowerDataset,
  EmpowerZipRecord,
  Reason,
  ScoreResult,
  ScoringInputs,
  Severity,
} from "@/lib/risk-engine";
// Pure module import (not the barrel) so client bundles never pull in `node:fs`.
import { outreachPriority, rankByPriority } from "@/lib/risk-engine/scoring";
import { buildScoringConfig } from "./scoring-config";

/** One ranked row: the ZIP record and its explainable score. */
export interface RankedRow {
  record: EmpowerZipRecord;
  result: ScoreResult;
}

/**
 * Score every ZIP (optionally in one county) and rank by outreach priority.
 * Unknown-ZIP rejections are skipped so no score is ever invented.
 */
export function buildRankedRows(
  dataset: Pick<EmpowerDataset, "zip" | "county">,
  severityByZip?: Map<string, Severity>,
  outageByZip?: Map<string, boolean>,
  countyFips?: string,
): RankedRow[] {
  const config = buildScoringConfig(dataset as EmpowerDataset);
  const knownZips = new Set(dataset.zip.map((record) => record.zip));

  const records = countyFips
    ? dataset.zip.filter((record) => record.countyFips === countyFips)
    : dataset.zip;

  const resultByZip = new Map<string, ScoreResult>();
  const recordByZip = new Map<string, EmpowerZipRecord>();

  for (const record of records) {
    const inputs: ScoringInputs = {
      zip: record.zip,
      powerDependentDme: record.powerDependentDme.value,
      severity: severityByZip?.get(record.zip) ?? "none",
      hasActiveOutage: outageByZip?.get(record.zip) ?? false,
    };
    const scored = outreachPriority(inputs, config, knownZips);
    if (!scored.ok) continue;
    resultByZip.set(record.zip, scored.value);
    recordByZip.set(record.zip, record);
  }

  return rankByPriority([...resultByZip.values()]).map((result) => ({
    record: recordByZip.get(result.zip)!,
    result,
  }));
}

/** Display-only score on a 0–100 scale (the scoring itself is unchanged). */
export function displayScore(score: number): number {
  return Math.round(score * 100);
}

/**
 * True when a reason reflects a factor that actually applies, so inactive
 * factors ("severity none", "no active outage") can be hidden. Reads the
 * existing reason labels only.
 */
export function reasonApplies(reason: Reason): boolean {
  if (reason.signal === "severity") return !/severity\s+none/i.test(reason.label);
  if (reason.signal === "outage") return !/no active outage/i.test(reason.label);
  return true;
}

/**
 * Priority buckets for the map legend, from the display score.
 *
 * Score range with the current config: dependents add 0 to 100 (the largest ZIP,
 * 444 residents, gets 100), each alert level adds 100 (Minor 100 up to Extreme
 * 400), and an active outage adds 100. So a ZIP with no alert or outage scores
 * 0 to 100 on people alone, and alerts or outages push it above 100.
 *   Lower  0–29    fewer than about 130 residents, no alert or outage
 *   Medium 30–99   more residents, no alert or outage
 *   Higher 100–199 an outage or a Minor alert, or a large ZIP with one
 *   Highest 200+   stronger alerts, or several signals together
 */
export type PriorityBucket = "lower" | "medium" | "higher" | "highest";

export const PRIORITY_BUCKETS: ReadonlyArray<{
  bucket: PriorityBucket;
  label: string;
  min: number;
}> = [
  { bucket: "highest", label: "Highest (200 or more)", min: 200 },
  { bucket: "higher", label: "Higher (100 to 199)", min: 100 },
  { bucket: "medium", label: "Medium (30 to 99)", min: 30 },
  { bucket: "lower", label: "Lower (0 to 29)", min: 0 },
];

/** Bucket a 0–100 display score for the legend and circle color. */
export function priorityBucket(score100: number): PriorityBucket {
  for (const b of PRIORITY_BUCKETS) {
    if (score100 >= b.min) return b.bucket;
  }
  return "lower";
}
