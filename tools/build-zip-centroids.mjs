#!/usr/bin/env node
// tools/build-zip-centroids.mjs
//
// Builds public/ma-zip-centroids.json from the US Census 2020 ZCTA Gazetteer.
//
// Source: https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_zcta_national.zip
// Usage:  node tools/build-zip-centroids.mjs /path/to/2020_Gaz_zcta_national.txt
//
// Keeps only ZIPs that appear in data/empower_ma_zip_oct2026.csv, stores the
// internal point (INTPTLAT, INTPTLONG) rounded to 4 decimals, and prints any
// emPOWER ZIPs with no matching ZCTA so they can be logged in data-notes.md.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const gazPath = process.argv[2];
if (!gazPath) {
  console.error("Usage: node tools/build-zip-centroids.mjs <2020_Gaz_zcta_national.txt>");
  process.exit(1);
}

const csv = readFileSync(join(ROOT, "data", "empower_ma_zip_oct2026.csv"), "utf8")
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)
  .map((l) => l.split(",")[0].trim());
const wanted = new Set(csv);

const lines = readFileSync(gazPath, "utf8").split(/\r?\n/).filter(Boolean);
const header = lines[0].split("\t").map((h) => h.trim());
const iZip = header.indexOf("GEOID");
const iLat = header.indexOf("INTPTLAT");
const iLng = header.indexOf("INTPTLONG");

const round = (n) => Math.round(n * 1e4) / 1e4;
const out = {};
for (const line of lines.slice(1)) {
  const cells = line.split("\t").map((c) => c.trim());
  const zip = cells[iZip];
  if (!wanted.has(zip)) continue;
  out[zip] = [round(Number(cells[iLat])), round(Number(cells[iLng]))];
}

const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
writeFileSync(join(ROOT, "public", "ma-zip-centroids.json"), JSON.stringify(sorted) + "\n");

const missing = csv.filter((z) => !(z in out)).sort();
console.log(`wrote ${Object.keys(sorted).length} centroids; ${missing.length} emPOWER ZIPs without a ZCTA`);
if (missing.length) console.log("missing:", missing.join(" "));
