// Outage_Loader — reads and validates the simulated-outage file.
//
// `validateOutages` is PURE: it operates over already-parsed JSON and returns
// `Result<SimulatedOutage[]>`, so it is directly schema-testable with no
// filesystem access. All non-determinism (the file read) lives in the I/O
// wrapper `loadSimulatedOutages`.
//
// Honesty rules enforced here:
// - Every accepted record is stamped `simulated: true` and `dataSource:
//   "simulated"` so downstream consumers can never mistake it for real data.
// - A non-conforming record fails fast with `SCHEMA_ERROR` naming the offending
//   field — never a silent default.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { type Result } from "./types";

const SIMULATED_SOURCE = "simulated" as const;

export interface SimulatedOutage {
  zip?: string;
  /** County name or FIPS; at least one of zip/county required. */
  county?: string;
  active: boolean;
  /** ISO timestamp. */
  start: string;
  /** Optional ISO timestamp. */
  estimatedRestore?: string;
  /** Always true. */
  simulated: true;
  dataSource: "simulated";
}

// ---------------------------------------------------------------------------
// Pure validation.
// ---------------------------------------------------------------------------

/** Build a `SCHEMA_ERROR` result naming the offending field. */
function schemaError<T>(field: string, message: string): Result<T> {
  return { ok: false, error: { code: "SCHEMA_ERROR", field, message } };
}

/**
 * Validate already-parsed JSON into a typed `SimulatedOutage[]`.
 *
 * Schema rules:
 * - The input must be an array.
 * - Each element must have a boolean `active`, a string `start`, and at least
 *   one of `zip`/`county`; `estimatedRestore` is optional (string when present).
 * - The first non-conforming record yields `SCHEMA_ERROR` with the offending
 *   field name.
 *
 * Every accepted record is stamped `simulated: true` and
 * `dataSource: "simulated"`.
 */
export function validateOutages(data: unknown): Result<SimulatedOutage[]> {
  if (!Array.isArray(data)) {
    return schemaError(
      "root",
      "Simulated-outage data must be an array of records."
    );
  }

  const records: SimulatedOutage[] = [];
  for (const element of data) {
    if (typeof element !== "object" || element === null) {
      return schemaError(
        "record",
        "Each simulated-outage record must be an object."
      );
    }

    const record = element as Record<string, unknown>;

    if (typeof record.active !== "boolean") {
      return schemaError(
        "active",
        'Field "active" must be a boolean.'
      );
    }

    if (typeof record.start !== "string") {
      return schemaError(
        "start",
        'Field "start" must be a string timestamp.'
      );
    }

    const hasZip = typeof record.zip === "string";
    const hasCounty = typeof record.county === "string";
    if (!hasZip && !hasCounty) {
      return schemaError(
        "zip",
        "Each record must have at least one of \"zip\" or \"county\"."
      );
    }

    if (record.estimatedRestore !== undefined &&
        typeof record.estimatedRestore !== "string") {
      return schemaError(
        "estimatedRestore",
        'Field "estimatedRestore" must be a string timestamp when present.'
      );
    }

    const outage: SimulatedOutage = {
      active: record.active,
      start: record.start,
      simulated: true,
      dataSource: SIMULATED_SOURCE,
    };
    if (hasZip) outage.zip = record.zip as string;
    if (hasCounty) outage.county = record.county as string;
    if (record.estimatedRestore !== undefined) {
      outage.estimatedRestore = record.estimatedRestore as string;
    }

    records.push(outage);
  }

  return { ok: true, value: records };
}

// ---------------------------------------------------------------------------
// I/O wrapper.
// ---------------------------------------------------------------------------

/** Default path to the simulated-outage file (the repo-root `data/`). */
const DEFAULT_OUTAGE_PATH = join(process.cwd(), "data", "sim-outages.json");

/**
 * Read the simulated-outage JSON file from `path` (default: the repo-root
 * `data/sim-outages.json`), parse it, and delegate to {@link validateOutages}.
 *
 * This is the single point of filesystem non-determinism for the loader; the
 * validator it delegates to stays pure. A file that cannot be parsed as JSON
 * yields `SCHEMA_ERROR`; any schema violation is propagated unchanged.
 */
export async function loadSimulatedOutages(
  path: string = DEFAULT_OUTAGE_PATH
): Promise<Result<SimulatedOutage[]>> {
  const text = await readFile(path, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return schemaError(
      "root",
      `Simulated-outage file is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  return validateOutages(parsed);
}
