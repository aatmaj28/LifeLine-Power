// lib/app/replay/replay.ts
//
// Pure logic for the simulated Storm Replay on /planner. Given one hourly frame
// and the emPOWER ZIP records, it works out which ZIPs are in simulated outage
// areas and how many power-dependent Medicare residents that covers.
//
// Honesty rules:
// - Everything here describes SIMULATED data. The UI labels it "Simulated".
// - Only counties with status "outage" count. "restoring" counties are shown
//   on the map but not counted, so the counter only claims "in outage areas".
// - ZIPs are matched only through the dataset's own countyFips, so a FIPS code
//   with no ZIPs, or a ZIP not in the dataset, can never be counted.
// - Masked ZIPs (value 11 = "11 or fewer") are counted as up to 11 and
//   reported separately so the UI can say so.
//
// No clock, no I/O: the same input always gives the same output.

/** County status in one simulated frame. */
export type ReplayStatus = "outage" | "restoring";

export interface ReplayCounty {
  fips: string;
  status: ReplayStatus;
}

export interface ReplayFrame {
  hour: number;
  label: string;
  counties: ReplayCounty[];
}

export interface ReplayFile {
  simulated: true;
  label?: string;
  name?: string;
  description: string;
  source?: string;
  /** When the simulated scenario file was authored (ISO string). */
  updatedAt?: string;
  hours: number;
  frames: ReplayFrame[];
}

/** The minimal ZIP shape the replay needs (a subset of EmpowerZipRecord). */
export interface ZipLite {
  zip: string;
  countyFips: string;
  powerDependentDme: { value: number; masked: boolean };
}

export interface ReplayCount {
  /** Sum of powerDependentDme.value over affected ZIPs (masked ZIPs count as up to 11). */
  total: number;
  /** Number of affected ZIPs. */
  zipCount: number;
  /** Affected ZIPs whose count is masked ("11 or fewer"). */
  maskedZipCount: number;
}

/** County FIPS codes in active (not restoring) outage for a frame. */
export function outageCountyFips(frame: ReplayFrame): Set<string> {
  const set = new Set<string>();
  for (const c of frame.counties) {
    if (c.status === "outage") set.add(c.fips);
  }
  return set;
}

/** Status per county for the map overlay (outage and restoring). */
export function countyStatusForFrame(frame: ReplayFrame): Map<string, ReplayStatus> {
  const map = new Map<string, ReplayStatus>();
  for (const c of frame.counties) {
    // "outage" wins if a county is (mistakenly) listed twice.
    if (map.get(c.fips) !== "outage") map.set(c.fips, c.status);
  }
  return map;
}

/**
 * ZIPs inside counties in active outage for this frame, sorted by ZIP so the
 * result never depends on input order. Duplicate ZIP records count once.
 */
export function affectedZips<Z extends ZipLite>(frame: ReplayFrame, zips: readonly Z[]): Z[] {
  const fips = outageCountyFips(frame);
  const seen = new Map<string, Z>();
  for (const z of zips) {
    if (fips.has(z.countyFips) && !seen.has(z.zip)) seen.set(z.zip, z);
  }
  return [...seen.values()].sort((a, b) => (a.zip < b.zip ? -1 : a.zip > b.zip ? 1 : 0));
}

/** The replay counter for one frame. */
export function replayCounter(frame: ReplayFrame, zips: readonly ZipLite[]): ReplayCount {
  const affected = affectedZips(frame, zips);
  let total = 0;
  let maskedZipCount = 0;
  for (const z of affected) {
    total += Math.max(0, z.powerDependentDme.value);
    if (z.powerDependentDme.masked) maskedZipCount += 1;
  }
  return { total, zipCount: affected.length, maskedZipCount };
}

/** hasActiveOutage per dataset ZIP for this frame (false for every other ZIP). */
export function outageFlagsForFrame(
  frame: ReplayFrame,
  zips: readonly ZipLite[],
): Map<string, boolean> {
  const fips = outageCountyFips(frame);
  const flags = new Map<string, boolean>();
  for (const z of zips) flags.set(z.zip, fips.has(z.countyFips));
  return flags;
}

/** Statewide total over the dataset (the ceiling for any frame's counter). */
export function statewideTotal(zips: readonly ZipLite[]): number {
  const seen = new Set<string>();
  let total = 0;
  for (const z of zips) {
    if (seen.has(z.zip)) continue;
    seen.add(z.zip);
    total += Math.max(0, z.powerDependentDme.value);
  }
  return total;
}

/** Clamp an hour to a valid frame index (integers 0..frameCount-1). */
export function clampHour(hour: number, frameCount: number): number {
  if (frameCount <= 0 || !Number.isFinite(hour)) return 0;
  return Math.min(frameCount - 1, Math.max(0, Math.trunc(hour)));
}

/**
 * Validate parsed JSON as a simulated replay file. Rejects anything not marked
 * simulated, so real-looking data can never be shown as a replay.
 */
export function parseReplayFile(data: unknown): ReplayFile | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.simulated !== true || !Array.isArray(d.frames)) return null;
  const frames: ReplayFrame[] = [];
  for (const f of d.frames) {
    if (typeof f !== "object" || f === null) return null;
    const fr = f as Record<string, unknown>;
    if (typeof fr.hour !== "number" || !Array.isArray(fr.counties)) return null;
    const counties: ReplayCounty[] = [];
    for (const c of fr.counties) {
      const cc = c as Record<string, unknown>;
      if (typeof cc?.fips !== "string") return null;
      if (cc.status !== "outage" && cc.status !== "restoring") return null;
      counties.push({ fips: cc.fips, status: cc.status });
    }
    frames.push({ hour: fr.hour, label: typeof fr.label === "string" ? fr.label : "", counties });
  }
  frames.sort((a, b) => a.hour - b.hour);
  return {
    simulated: true,
    label: typeof d.label === "string" ? d.label : "Simulated",
    name: typeof d.name === "string" ? d.name : undefined,
    description: typeof d.description === "string" ? d.description : "",
    source: typeof d.source === "string" ? d.source : undefined,
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : undefined,
    hours: typeof d.hours === "number" ? d.hours : frames.length - 1,
    frames,
  };
}
