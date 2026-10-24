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
 * The buckets follow how scores actually move: with the current scoring config,
 * the dependents factor adds at most a few points (ZIP counts are normalized by
 * the dataset-wide max, which includes county totals), while each alert level
 * adds about 100 and an active outage adds about 100. So the buckets step at
 * 100s. Circle SIZE still shows the dependent count.
 */
export type PriorityBucket = "lower" | "medium" | "higher" | "highest";

export const PRIORITY_BUCKETS: ReadonlyArray<{
  bucket: PriorityBucket;
  label: string;
  min: number;
}> = [
  { bucket: "highest", label: "Highest (300 or more)", min: 300 },
  { bucket: "higher", label: "Higher (200 to 299)", min: 200 },
  { bucket: "medium", label: "Medium (100 to 199)", min: 100 },
  { bucket: "lower", label: "Lower (under 100, no alert or outage)", min: 0 },
];

/** Bucket a 0–100 display score for the legend and circle color. */
export function priorityBucket(score100: number): PriorityBucket {
  for (const b of PRIORITY_BUCKETS) {
    if (score100 >= b.min) return b.bucket;
  }
  return "lower";
}
