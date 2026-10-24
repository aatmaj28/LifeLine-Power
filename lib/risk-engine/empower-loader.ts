// emPOWER_Loader — parses the three HHS emPOWER CSV datasets into typed,
// validated records.
//
// The parse functions below are PURE: they operate over already-read CSV text
// and return `Result<...[]>`, so they are directly property-testable with no
// filesystem access. All non-determinism (file reads) lives in the I/O wrapper
// `loadEmpowerDataset` (implemented in a later task).
//
// Honesty rules enforced here:
// - ZIP and county_fips stay as text so leading zeros survive ("02360").
// - `power_dependent_dme` is wrapped in `SmallCount` so a value of 11 surfaces
//   as "11 or fewer".
// - Every record is stamped with the aggregated/de-identified Medicare source.
// - A missing required column fails fast with `MISSING_COLUMN`; an unparseable
//   numeric field rejects that record with `PARSE_ERROR` — never a silent default.
// - Sole exception: `pct_power_dependent` is a DERIVED column and may be blank
//   when medicare_benes = 0 (ratio undefined); an empty cell there becomes 0.
//   See `parsePctPowerDependent`. All other numeric fields stay strict.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { type Result, type SmallCount, makeSmallCount } from "./types";

const EMPOWER_SOURCE = "empower-aggregated-deidentified-medicare" as const;

export interface EmpowerZipRecord {
  /** 5-char text, leading zeros preserved. */
  zip: string;
  county: string;
  /** 5-char text. */
  countyFips: string;
  medicareBenes: number;
  /** PRIMARY dependent count. */
  powerDependentDme: SmallCount;
  esrdDialysisAnyDme: number;
  o2ServicesAnyDme: number;
  homeHealthAnyDme: number;
  hospiceAnyDme: number;
  healthcareSrvcAnyDme: number;
  pctPowerDependent: number;
  dataSource: "empower-aggregated-deidentified-medicare";
}

export interface EmpowerCountyRecord {
  countyFips: string;
  county: string;
  medicareBenes: number;
  powerDependentDme: SmallCount;
  esrdDialysisAnyDme: number;
  o2ServicesAnyDme: number;
  homeHealthAnyDme: number;
  hospiceAnyDme: number;
  healthcareSrvcAnyDme: number;
  pctPowerDependent: number;
  dataSource: "empower-aggregated-deidentified-medicare";
}

export interface EmpowerMonthlyRecord {
  zip: string;
  county: string;
  /** e.g. "2026-10". */
  month: string;
  medicareBenes: number;
  powerDependentDme: SmallCount;
  dataSource: "empower-aggregated-deidentified-medicare";
}

export interface EmpowerDataset {
  zip: EmpowerZipRecord[];
  county: EmpowerCountyRecord[];
  monthly: EmpowerMonthlyRecord[];
  /** Index for O(1) ZIP lookup. */
  zipByCode: Map<string, EmpowerZipRecord>;
  /** Index for O(1) alert fan-out. */
  zipsByCountyFips: Map<string, EmpowerZipRecord[]>;
}

// ---------------------------------------------------------------------------
// Required columns per dataset (from the CSV headers).
// ---------------------------------------------------------------------------

const ZIP_COLUMNS = [
  "zip",
  "county",
  "county_fips",
  "medicare_benes",
  "power_dependent_dme",
  "esrd_dialysis_any_dme",
  "o2_services_any_dme",
  "home_health_any_dme",
  "hospice_any_dme",
  "healthcare_srvc_any_dme",
  "pct_power_dependent",
] as const;

const COUNTY_COLUMNS = [
  "county_fips",
  "county",
  "medicare_benes",
  "power_dependent_dme",
  "esrd_dialysis_any_dme",
  "o2_services_any_dme",
  "home_health_any_dme",
  "hospice_any_dme",
  "healthcare_srvc_any_dme",
  "pct_power_dependent",
] as const;

const MONTHLY_COLUMNS = [
  "zip",
  "county",
  "month",
  "medicare_benes",
  "power_dependent_dme",
] as const;

// ---------------------------------------------------------------------------
// Internal CSV helpers (pure).
// ---------------------------------------------------------------------------

/**
 * Split CSV text into non-empty rows of trimmed cell values. The emPOWER files
 * contain plain comma-separated values with no quoting, so a simple split is
 * sufficient and keeps the parser transparent.
 */
function toRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(",").map((cell) => cell.trim()));
}

/**
 * Verify every required column is present in the header. Returns the offending
 * column name as a `MISSING_COLUMN` error, otherwise a `columnName -> index`
 * map for row access.
 */
function indexHeader(
  header: string[],
  required: readonly string[]
): Result<Map<string, number>> {
  const index = new Map<string, number>();
  header.forEach((name, i) => {
    if (!index.has(name)) index.set(name, i);
  });

  for (const column of required) {
    if (!index.has(column)) {
      return {
        ok: false,
        error: {
          code: "MISSING_COLUMN",
          field: column,
          message: `Required column "${column}" is missing from the CSV header.`,
        },
      };
    }
  }

  return { ok: true, value: index };
}

/**
 * Parse a cell as a finite number. Returns a `PARSE_ERROR` naming the field
 * when the value is empty or not a finite number — never a silent default.
 */
function parseNumber(
  value: string | undefined,
  field: string
): Result<number> {
  if (value === undefined || value.length === 0) {
    return {
      ok: false,
      error: {
        code: "PARSE_ERROR",
        field,
        message: `Field "${field}" is missing a value.`,
      },
    };
  }

  const n = Number(value);
  if (!Number.isFinite(n)) {
    return {
      ok: false,
      error: {
        code: "PARSE_ERROR",
        field,
        message: `Field "${field}" value "${value}" is not a finite number.`,
      },
    };
  }

  return { ok: true, value: n };
}

/**
 * Parse `pct_power_dependent` leniently: an EMPTY cell becomes 0, any present
 * cell is parsed as a finite number via {@link parseNumber}.
 *
 * Rationale: `pct_power_dependent` is a DERIVED convenience column
 * (power_dependent_dme / medicare_benes * 100). When a ZIP/county has
 * medicare_benes = 0 the ratio is undefined, so the source leaves the cell
 * blank (e.g. real ZIP 02542 Barnstable: all counts 0, trailing comma). We
 * treat that single blank derived column as 0 so the full dataset loads. This
 * leniency is intentionally scoped to this column only — zip/county/count
 * fields still reject empty or malformed values with PARSE_ERROR, and the
 * column must still exist in the header (MISSING_COLUMN otherwise).
 */
function parsePctPowerDependent(
  value: string | undefined,
  field: string
): Result<number> {
  if (value === undefined || value.length === 0) {
    return { ok: true, value: 0 };
  }
  return parseNumber(value, field);
}

// ---------------------------------------------------------------------------
// Pure parse functions.
// ---------------------------------------------------------------------------

/** Parse the ZIP-level emPOWER CSV text into typed records. */
export function parseZipCsv(text: string): Result<EmpowerZipRecord[]> {
  const rows = toRows(text);
  if (rows.length === 0) return { ok: true, value: [] };

  const headerResult = indexHeader(rows[0], ZIP_COLUMNS);
  if (!headerResult.ok) return headerResult;
  const col = headerResult.value;

  const records: EmpowerZipRecord[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const num = (field: string): Result<number> =>
      parseNumber(row[col.get(field)!], field);

    const medicareBenes = num("medicare_benes");
    if (!medicareBenes.ok) return medicareBenes;
    const powerDependentDme = num("power_dependent_dme");
    if (!powerDependentDme.ok) return powerDependentDme;
    const esrdDialysisAnyDme = num("esrd_dialysis_any_dme");
    if (!esrdDialysisAnyDme.ok) return esrdDialysisAnyDme;
    const o2ServicesAnyDme = num("o2_services_any_dme");
    if (!o2ServicesAnyDme.ok) return o2ServicesAnyDme;
    const homeHealthAnyDme = num("home_health_any_dme");
    if (!homeHealthAnyDme.ok) return homeHealthAnyDme;
    const hospiceAnyDme = num("hospice_any_dme");
    if (!hospiceAnyDme.ok) return hospiceAnyDme;
    const healthcareSrvcAnyDme = num("healthcare_srvc_any_dme");
    if (!healthcareSrvcAnyDme.ok) return healthcareSrvcAnyDme;
    // pct_power_dependent is a derived column: empty → 0 (see helper).
    const pctPowerDependent = parsePctPowerDependent(
      row[col.get("pct_power_dependent")!],
      "pct_power_dependent"
    );
    if (!pctPowerDependent.ok) return pctPowerDependent;

    records.push({
      zip: row[col.get("zip")!] ?? "",
      county: row[col.get("county")!] ?? "",
      countyFips: row[col.get("county_fips")!] ?? "",
      medicareBenes: medicareBenes.value,
      powerDependentDme: makeSmallCount(powerDependentDme.value),
      esrdDialysisAnyDme: esrdDialysisAnyDme.value,
      o2ServicesAnyDme: o2ServicesAnyDme.value,
      homeHealthAnyDme: homeHealthAnyDme.value,
      hospiceAnyDme: hospiceAnyDme.value,
      healthcareSrvcAnyDme: healthcareSrvcAnyDme.value,
      pctPowerDependent: pctPowerDependent.value,
      dataSource: EMPOWER_SOURCE,
    });
  }

  return { ok: true, value: records };
}

/** Parse the county-level emPOWER CSV text into typed records. */
export function parseCountyCsv(text: string): Result<EmpowerCountyRecord[]> {
  const rows = toRows(text);
  if (rows.length === 0) return { ok: true, value: [] };

  const headerResult = indexHeader(rows[0], COUNTY_COLUMNS);
  if (!headerResult.ok) return headerResult;
  const col = headerResult.value;

  const records: EmpowerCountyRecord[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const num = (field: string): Result<number> =>
      parseNumber(row[col.get(field)!], field);

    const medicareBenes = num("medicare_benes");
    if (!medicareBenes.ok) return medicareBenes;
    const powerDependentDme = num("power_dependent_dme");
    if (!powerDependentDme.ok) return powerDependentDme;
    const esrdDialysisAnyDme = num("esrd_dialysis_any_dme");
    if (!esrdDialysisAnyDme.ok) return esrdDialysisAnyDme;
    const o2ServicesAnyDme = num("o2_services_any_dme");
    if (!o2ServicesAnyDme.ok) return o2ServicesAnyDme;
    const homeHealthAnyDme = num("home_health_any_dme");
    if (!homeHealthAnyDme.ok) return homeHealthAnyDme;
    const hospiceAnyDme = num("hospice_any_dme");
    if (!hospiceAnyDme.ok) return hospiceAnyDme;
    const healthcareSrvcAnyDme = num("healthcare_srvc_any_dme");
    if (!healthcareSrvcAnyDme.ok) return healthcareSrvcAnyDme;
    // pct_power_dependent is a derived column: empty → 0 (see helper).
    const pctPowerDependent = parsePctPowerDependent(
      row[col.get("pct_power_dependent")!],
      "pct_power_dependent"
    );
    if (!pctPowerDependent.ok) return pctPowerDependent;

    records.push({
      countyFips: row[col.get("county_fips")!] ?? "",
      county: row[col.get("county")!] ?? "",
      medicareBenes: medicareBenes.value,
      powerDependentDme: makeSmallCount(powerDependentDme.value),
      esrdDialysisAnyDme: esrdDialysisAnyDme.value,
      o2ServicesAnyDme: o2ServicesAnyDme.value,
      homeHealthAnyDme: homeHealthAnyDme.value,
      hospiceAnyDme: hospiceAnyDme.value,
      healthcareSrvcAnyDme: healthcareSrvcAnyDme.value,
      pctPowerDependent: pctPowerDependent.value,
      dataSource: EMPOWER_SOURCE,
    });
  }

  return { ok: true, value: records };
}

/** Parse the monthly-trend emPOWER CSV text into typed records. */
export function parseMonthlyCsv(text: string): Result<EmpowerMonthlyRecord[]> {
  const rows = toRows(text);
  if (rows.length === 0) return { ok: true, value: [] };

  const headerResult = indexHeader(rows[0], MONTHLY_COLUMNS);
  if (!headerResult.ok) return headerResult;
  const col = headerResult.value;

  const records: EmpowerMonthlyRecord[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const num = (field: string): Result<number> =>
      parseNumber(row[col.get(field)!], field);

    const medicareBenes = num("medicare_benes");
    if (!medicareBenes.ok) return medicareBenes;
    const powerDependentDme = num("power_dependent_dme");
    if (!powerDependentDme.ok) return powerDependentDme;

    records.push({
      zip: row[col.get("zip")!] ?? "",
      county: row[col.get("county")!] ?? "",
      month: row[col.get("month")!] ?? "",
      medicareBenes: medicareBenes.value,
      powerDependentDme: makeSmallCount(powerDependentDme.value),
      dataSource: EMPOWER_SOURCE,
    });
  }

  return { ok: true, value: records };
}

// ---------------------------------------------------------------------------
// I/O wrapper.
// ---------------------------------------------------------------------------

/** Default directory holding the emPOWER CSV files (the repo-root `data/`). */
const DEFAULT_DATA_DIR = join(process.cwd(), "data");

const ZIP_FILE = "empower_ma_zip_oct2026.csv";
const COUNTY_FILE = "empower_ma_county_oct2026.csv";
const MONTHLY_FILE = "empower_ma_zip_monthly_2026.csv";

/**
 * Read the three emPOWER CSV files from `dir` (default: the repo-root `data/`
 * directory), parse them with the pure parsers, and assemble an
 * {@link EmpowerDataset} with lookup indices.
 *
 * This is the single point of filesystem non-determinism for the loader; the
 * parsers it delegates to stay pure. Any parser error (`MISSING_COLUMN`,
 * `PARSE_ERROR`) is propagated unchanged.
 */
export async function loadEmpowerDataset(
  dir: string = DEFAULT_DATA_DIR
): Promise<Result<EmpowerDataset>> {
  const [zipText, countyText, monthlyText] = await Promise.all([
    readFile(join(dir, ZIP_FILE), "utf8"),
    readFile(join(dir, COUNTY_FILE), "utf8"),
    readFile(join(dir, MONTHLY_FILE), "utf8"),
  ]);

  const zipResult = parseZipCsv(zipText);
  if (!zipResult.ok) return zipResult;

  const countyResult = parseCountyCsv(countyText);
  if (!countyResult.ok) return countyResult;

  const monthlyResult = parseMonthlyCsv(monthlyText);
  if (!monthlyResult.ok) return monthlyResult;

  const zip = zipResult.value;
  const county = countyResult.value;
  const monthly = monthlyResult.value;

  // Build lookup indices: zipByCode for O(1) ZIP lookup, zipsByCountyFips for
  // O(1) alert fan-out across every ZIP in a county.
  const zipByCode = new Map<string, EmpowerZipRecord>();
  const zipsByCountyFips = new Map<string, EmpowerZipRecord[]>();
  for (const record of zip) {
    zipByCode.set(record.zip, record);

    const group = zipsByCountyFips.get(record.countyFips);
    if (group) {
      group.push(record);
    } else {
      zipsByCountyFips.set(record.countyFips, [record]);
    }
  }

  return {
    ok: true,
    value: { zip, county, monthly, zipByCode, zipsByCountyFips },
  };
}
