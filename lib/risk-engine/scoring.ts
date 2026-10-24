// Pure, explainable, weighted-additive outreach-priority scoring for the
// PowerPlan Risk Engine.
//
// The dependent-count contribution is normalized by a FIXED dataset-wide
// maximum (`config.dependentMax`), not a per-call maximum. Because the
// denominator does not depend on the ZIP being scored, raising one ZIP's
// dependent count can never change another ZIP's normalization — this is what
// makes the monotonicity invariants (Requirements 4.6, 4.7) hold.
//
// This module is pure: it never touches the network, filesystem, or clock. All
// inputs arrive as parameters so the invariants can be exercised directly by
// property-based tests.

import type { DataSource, Result, Severity } from "./types";

/**
 * A labeled, non-negative contribution to an {@link ScoreResult}. Each reason
 * describes exactly one signal and its magnitude so a score can be explained.
 */
export interface Reason {
  /** The signal this reason accounts for. */
  signal: "dependents" | "severity" | "outage";
  /** Human-readable description, e.g. "444 power-dependent (normalized 0.62)". */
  label: string;
  /** Non-negative contribution to the score. */
  value: number;
}

/**
 * The explainable result of scoring a single ZIP: the numeric score, the
 * labeled reasons that sum to it, and every data source that fed it.
 */
export interface ScoreResult {
  /** The ZIP that was scored. */
  zip: string;
  /** Sum of every `reason.value`; non-negative. */
  score: number;
  /** One labeled, non-negative reason per contributing signal. */
  reasons: Reason[];
  /** Every provenance label that fed this score. */
  dataSources: DataSource[];
}

/**
 * The per-ZIP signals fed into {@link outreachPriority}. All non-determinism is
 * resolved before this point so scoring stays pure.
 */
export interface ScoringInputs {
  /** The ZIP being scored. */
  zip: string;
  /** Raw dependent count (emPOWER `power_dependent_dme`) for the ZIP. */
  powerDependentDme: number;
  /** Highest severity affecting the ZIP; `"none"` if no alert applies. */
  severity: Severity;
  /** True when an active NWS alert or active simulated outage affects the ZIP. */
  hasActiveOutage: boolean;
}

/**
 * Weights and the fixed normalization denominator for scoring. `dependentMax`
 * is derived once from the loaded dataset (the dataset-wide maximum
 * `power_dependent_dme`) and must be positive; `severityWeight` must be
 * strictly increasing across none < Minor < Moderate < Severe < Extreme.
 */
export interface ScoringConfig {
  /** FIXED dataset-wide max used for normalization; must be > 0. */
  dependentMax: number;
  /** Weight applied to the normalized dependent contribution; must be >= 0. */
  dependentWeight: number;
  /** Strictly-increasing, non-negative weight per severity. */
  severityWeight: Record<Severity, number>;
  /** Non-negative bonus added when an active outage affects the ZIP. */
  outageBonus: number;
}

/** Clamp `value` into the inclusive range [`min`, `max`]. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Compute an explainable, weighted-additive outreach-priority score for a ZIP.
 *
 * The score is the sum of three non-negative contributions:
 *
 * ```
 * normalizedDependents  = clamp(powerDependentDme / config.dependentMax, 0, 1)
 * dependentContribution = config.dependentWeight * normalizedDependents
 * severityContribution  = config.severityWeight[severity]
 * outageContribution    = hasActiveOutage ? config.outageBonus : 0
 * score = dependentContribution + severityContribution + outageContribution
 * ```
 *
 * The normalization denominator is the FIXED `config.dependentMax`, so a ZIP's
 * contribution depends only on its own dependent count — preserving the
 * monotonicity invariants (Requirements 4.6, 4.7).
 *
 * A ZIP absent from `knownZips` is rejected with `UNKNOWN_ZIP` and never scored
 * (Requirement 4.8).
 *
 * @param inputs The per-ZIP signals to score.
 * @param config Weights and the fixed normalization denominator.
 * @param knownZips The set of ZIPs present in the emPOWER dataset.
 * @returns A `Result` holding the {@link ScoreResult}, or an `UNKNOWN_ZIP` error.
 */
export function outreachPriority(
  inputs: ScoringInputs,
  config: ScoringConfig,
  knownZips: ReadonlySet<string>,
): Result<ScoreResult> {
  // Reject unknown ZIPs: never fabricate a score for a ZIP we have no data for.
  if (!knownZips.has(inputs.zip)) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_ZIP",
        field: "zip",
        message: `ZIP "${inputs.zip}" is not present in the emPOWER ZIP dataset`,
      },
    };
  }

  // Dependent contribution, normalized against the FIXED dataset-wide max and
  // clamped to [0, 1] so it stays non-negative and bounded.
  const normalizedDependents = clamp(
    inputs.powerDependentDme / config.dependentMax,
    0,
    1,
  );
  const dependentContribution = config.dependentWeight * normalizedDependents;

  // Severity contribution comes straight from the strictly-increasing weights.
  const severityContribution = config.severityWeight[inputs.severity];

  // Outage bonus applies only when an active outage affects the ZIP.
  const outageContribution = inputs.hasActiveOutage ? config.outageBonus : 0;

  const reasons: Reason[] = [
    {
      signal: "dependents",
      label: `${inputs.powerDependentDme} power-dependent (normalized ${normalizedDependents.toFixed(
        2,
      )})`,
      value: dependentContribution,
    },
    {
      signal: "severity",
      label: `severity ${inputs.severity}`,
      value: severityContribution,
    },
    {
      signal: "outage",
      label: inputs.hasActiveOutage
        ? "active outage bonus"
        : "no active outage",
      value: outageContribution,
    },
  ];

  const score = reasons.reduce((sum, reason) => sum + reason.value, 0);

  // Every signal that fed this score. Dependents always come from emPOWER; a
  // non-"none" severity reflects a live NWS alert; an active outage reflects a
  // simulated outage (or live alert, already captured by severity).
  const dataSources: DataSource[] = ["empower-aggregated-deidentified-medicare"];
  if (inputs.severity !== "none") {
    dataSources.push("nws-live-alert");
  }
  if (inputs.hasActiveOutage) {
    dataSources.push("simulated");
  }

  return {
    ok: true,
    value: {
      zip: inputs.zip,
      score,
      reasons,
      dataSources,
    },
  };
}

/**
 * Rank scored ZIPs from highest to lowest outreach priority.
 *
 * Results are sorted by `score` descending, with ties broken by `zip`
 * ascending. Because ZIPs are unique, the comparator `(score, zip)` is a total
 * order over the input set, so the output ordering is a function of the set
 * alone — applying this to any permutation of the same results yields the same
 * ordering (Requirement 5.2).
 *
 * The input array is never mutated; a new sorted array is returned.
 *
 * @param results The scored ZIPs to rank.
 * @returns A new array sorted by score descending, ties broken by zip ascending.
 */
export function rankByPriority(results: ScoreResult[]): ScoreResult[] {
  return [...results].sort((a, b) => {
    if (b.score !== a.score) {
      // Higher score ranks first.
      return b.score - a.score;
    }
    // Deterministic tiebreaker: lower ZIP ranks first.
    return a.zip < b.zip ? -1 : a.zip > b.zip ? 1 : 0;
  });
}
