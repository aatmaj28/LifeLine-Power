// tools/powerplan-mcp/lib.mjs
//
// Pure data access for the PowerPlan MCP server. Reads the HHS emPOWER CSVs in
// data/ once and answers small queries. No network, no writes.
//
// Honesty rules carried over from the app:
// - emPOWER figures are aggregated, de-identified Medicare data.
// - A power_dependent_dme value of 11 means "11 or fewer" (small-cell masking).
// - Unknown counties or ZIPs return an error, never made-up numbers.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DATA_DIR = join(HERE, "..", "..", "data");

export const SOURCE_NOTE =
  "HHS emPOWER, October 2026. Aggregated, de-identified Medicare data. A value of 11 means 11 or fewer.";

const NUMERIC = [
  "medicare_benes",
  "power_dependent_dme",
  "esrd_dialysis_any_dme",
  "o2_services_any_dme",
  "home_health_any_dme",
  "hospice_any_dme",
  "healthcare_srvc_any_dme",
  "pct_power_dependent",
];

/** Honest label for a possibly masked count. */
export function label(n) {
  return n === 11 ? "11 or fewer" : String(n);
}

/** Parse plain comma-separated text (no quoting in these files) into objects. */
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row = {};
    header.forEach((h, i) => {
      const raw = cells[i] ?? "";
      if (NUMERIC.includes(h)) {
        // pct_power_dependent is blank when medicare_benes is 0 (see decisions.md).
        row[h] = raw === "" ? 0 : Number(raw);
      } else {
        row[h] = raw;
      }
    });
    return row;
  });
}

/** Load both datasets from a data directory. */
export function loadData(dir = DEFAULT_DATA_DIR) {
  const zips = parseCsv(readFileSync(join(dir, "empower_ma_zip_oct2026.csv"), "utf8"));
  const counties = parseCsv(readFileSync(join(dir, "empower_ma_county_oct2026.csv"), "utf8"));
  return { zips, counties };
}

function normalizeCounty(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+county$/, "");
}

function findCounty(data, county) {
  const key = normalizeCounty(county);
  return data.counties.find(
    (c) => normalizeCounty(c.county) === key || c.county_fips === String(county).trim(),
  );
}

function zipView(z) {
  return {
    zip: z.zip,
    county: z.county,
    county_fips: z.county_fips,
    medicare_benes: z.medicare_benes,
    power_dependent_dme: z.power_dependent_dme,
    power_dependent_label: label(z.power_dependent_dme),
    masked: z.power_dependent_dme === 11,
    also_relies_on: {
      dialysis: label(z.esrd_dialysis_any_dme),
      oxygen_services: label(z.o2_services_any_dme),
      home_health: label(z.home_health_any_dme),
      hospice: label(z.hospice_any_dme),
    },
    pct_power_dependent: z.pct_power_dependent,
  };
}

/** county_summary: one county's emPOWER figures, by name or FIPS. */
export function countySummary(data, county) {
  const c = findCounty(data, county);
  if (!c) {
    return {
      ok: false,
      error: `Unknown county "${county}". Use one of: ${data.counties.map((x) => x.county).join(", ")}.`,
    };
  }
  const zipsInCounty = data.zips.filter((z) => z.county_fips === c.county_fips);
  return {
    ok: true,
    value: {
      county: c.county,
      county_fips: c.county_fips,
      medicare_benes: c.medicare_benes,
      power_dependent_dme: c.power_dependent_dme,
      power_dependent_label: label(c.power_dependent_dme),
      pct_power_dependent: c.pct_power_dependent,
      also_relies_on: {
        dialysis: label(c.esrd_dialysis_any_dme),
        oxygen_services: label(c.o2_services_any_dme),
        home_health: label(c.home_health_any_dme),
        hospice: label(c.hospice_any_dme),
      },
      zip_count: zipsInCounty.length,
      masked_zip_count: zipsInCounty.filter((z) => z.power_dependent_dme === 11).length,
      zip_sum_power_dependent: zipsInCounty.reduce((s, z) => s + z.power_dependent_dme, 0),
      source: SOURCE_NOTE,
    },
  };
}

/** top_zips: ZIPs ranked by power_dependent_dme, optionally within one county. */
export function topZips(data, { county, limit = 10 } = {}) {
  let pool = data.zips;
  if (county !== undefined && county !== null && String(county).trim() !== "") {
    const c = findCounty(data, county);
    if (!c) {
      return { ok: false, error: `Unknown county "${county}".` };
    }
    pool = pool.filter((z) => z.county_fips === c.county_fips);
  }
  const n = Math.max(1, Math.min(100, Math.floor(Number(limit) || 10)));
  const ranked = [...pool]
    .sort((a, b) => b.power_dependent_dme - a.power_dependent_dme || a.zip.localeCompare(b.zip))
    .slice(0, n)
    .map(zipView);
  return { ok: true, value: { zips: ranked, source: SOURCE_NOTE } };
}

/** zip_detail: one ZIP's figures. */
export function zipDetail(data, zip) {
  const key = String(zip ?? "").trim().padStart(5, "0");
  const z = data.zips.find((r) => r.zip === key);
  if (!z) {
    return { ok: false, error: `ZIP "${zip}" is not in the Massachusetts emPOWER dataset.` };
  }
  return { ok: true, value: { ...zipView(z), source: SOURCE_NOTE } };
}
