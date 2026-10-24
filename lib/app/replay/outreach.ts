// lib/app/replay/outreach.ts
//
// Pure math for the SIMULATED "Outreach comparison" panel in Storm Replay.
//
// Question it answers: if a planner calls the top N ZIPs in some order, what
// share of the power-dependent residents in simulated outage areas live in the
// ZIPs they called?
//
//   coverage(order, N) = (sum of residents in affected ZIPs among the first N
//                         ZIPs of `order`) / (sum of residents in all affected ZIPs)
//
// Three orders are compared: PowerPlan priority order (the ranked list), random
// order (averaged over seeded shuffles, so it is deterministic), and
// alphabetical by ZIP.
//
// Honesty notes:
// - Everything here describes simulated outages; the UI labels it "Simulated".
// - Masked ZIPs ("11 or fewer") count as up to 11, same as the replay counter.
// - When no ZIP is in a simulated outage area, coverage is undefined; we return
//   `affectedTotal: 0` and coverage 0 so the UI can say so instead of showing a
//   meaningless percentage.
// - Nothing here assumes PowerPlan order wins. The UI sentence is built from the
//   numbers (see `outreachSentence`).

/** Default number of seeded shuffles averaged for the random baseline. */
export const RANDOM_TRIALS = 500;
/** Default seed for the random baseline. Fixed, so results are reproducible. */
export const RANDOM_SEED = 20261024;
/** The N choices offered in the panel. */
export const OUTREACH_N_OPTIONS = [10, 20, 50] as const;

export interface OutreachResult {
  n: number;
  /** Residents in all affected ZIPs (the denominator). */
  affectedTotal: number;
  /** Shares in [0, 1]. All 0 when affectedTotal is 0. */
  powerplan: number;
  random: number;
  alphabetical: number;
  trials: number;
  seed: number;
}

/** Keep the first occurrence of each ZIP, preserving order. */
export function uniqueOrder(order: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const zip of order) {
    if (!seen.has(zip)) {
      seen.add(zip);
      out.push(zip);
    }
  }
  return out;
}

function affectedSum(affected: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const v of affected.values()) total += Math.max(0, v);
  return total;
}

/** Residents reached by calling the first `n` ZIPs of `order`. */
export function reachedCount(
  order: readonly string[],
  affected: ReadonlyMap<string, number>,
  n: number,
): number {
  const limit = Math.max(0, Math.floor(n));
  const seen = new Set<string>();
  let reached = 0;
  for (const zip of order) {
    if (seen.size >= limit) break;
    if (seen.has(zip)) continue; // a ZIP called twice is still one call
    seen.add(zip);
    reached += Math.max(0, affected.get(zip) ?? 0);
  }
  return reached;
}

/** Share in [0, 1] of affected residents reached by the first `n` of `order`. */
export function coverage(
  order: readonly string[],
  affected: ReadonlyMap<string, number>,
  n: number,
): number {
  const total = affectedSum(affected);
  if (total <= 0) return 0;
  return Math.min(1, reachedCount(order, affected, n) / total);
}

/** Small, fast, seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The first `n` ZIPs of a seeded random shuffle (partial Fisher–Yates).
 * Each trial has its own PRNG, so the first n picks of a trial are the same
 * for every n. That keeps the random baseline monotone in n.
 */
export function shuffledPrefix(
  zips: readonly string[],
  n: number,
  seed: number,
  trial: number,
): string[] {
  const a = [...zips];
  const rand = mulberry32((seed ^ Math.imul(trial + 1, 0x9e3779b1)) >>> 0);
  const k = Math.min(Math.max(0, Math.floor(n)), a.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (a.length - i));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a.slice(0, k);
}

/** Mean coverage over `trials` seeded shuffles of `zips`. */
export function randomCoverage(
  zips: readonly string[],
  affected: ReadonlyMap<string, number>,
  n: number,
  { seed = RANDOM_SEED, trials = RANDOM_TRIALS }: { seed?: number; trials?: number } = {},
): number {
  const total = affectedSum(affected);
  const pool = uniqueOrder(zips);
  if (total <= 0 || trials <= 0) return 0;
  // Sum integer counts first, divide once: exact, and monotone in n.
  let reached = 0;
  for (let t = 0; t < trials; t++) {
    reached += reachedCount(shuffledPrefix(pool, n, seed, t), affected, n);
  }
  return Math.min(1, reached / (trials * total));
}

/** Alphabetical (numeric string) order by ZIP. */
export function alphabeticalOrder(zips: readonly string[]): string[] {
  return uniqueOrder(zips).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Compare the three orders for one frame.
 *
 * @param priorityOrder ZIPs in PowerPlan priority order (the ranked list).
 * @param allZips       Every ZIP that could be called (the dataset).
 * @param affected      Residents per ZIP in simulated outage areas this frame.
 * @param n             How many ZIPs are called.
 */
export function outreachComparison(params: {
  priorityOrder: readonly string[];
  allZips: readonly string[];
  affected: ReadonlyMap<string, number>;
  n: number;
  seed?: number;
  trials?: number;
}): OutreachResult {
  const { priorityOrder, allZips, affected, n } = params;
  const seed = params.seed ?? RANDOM_SEED;
  const trials = params.trials ?? RANDOM_TRIALS;
  const affectedTotal = affectedSum(affected);
  return {
    n,
    affectedTotal,
    powerplan: coverage(priorityOrder, affected, n),
    random: randomCoverage(allZips, affected, n, { seed, trials }),
    alphabetical: coverage(alphabeticalOrder(allZips), affected, n),
    trials,
    seed,
  };
}

/** Whole-number percent for display. */
export function percent(share: number): number {
  return Math.round(Math.min(1, Math.max(0, share)) * 100);
}

/**
 * One plain sentence that states only what the numbers show. It never claims
 * PowerPlan order is better unless its rounded percentage is actually higher.
 */
export function outreachSentence(r: OutreachResult): string {
  if (r.affectedTotal <= 0) {
    return "No ZIP codes are in simulated outage areas this hour, so there is nothing to compare.";
  }
  const pp = percent(r.powerplan);
  const rnd = percent(r.random);
  const head = `Calling the top ${r.n} ZIPs in PowerPlan order reaches ${pp}% of affected residents`;
  if (pp > rnd) return `${head}, vs ${rnd}% in random order.`;
  if (pp === rnd) return `${head}, about the same as random order (${rnd}%).`;
  return `${head}, less than the ${rnd}% reached in random order this hour.`;
}
