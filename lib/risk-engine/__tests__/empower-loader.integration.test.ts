import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadEmpowerDataset } from "../empower-loader";

/**
 * Integration test for loadEmpowerDataset. This confirms the I/O wrapper reads
 * the three files from a directory, delegates to the pure parsers, and builds
 * the lookup indices (zipByCode, zipsByCountyFips).
 *
 * It runs against a small, well-formed fixture directory rather than the real
 * data/ CSVs: the production ZIP file intentionally contains a row with an
 * empty numeric field, which the parsers correctly reject per Req 1.7 (never
 * silently default). Detailed parser behavior — leading zeros, masking, and the
 * MISSING_COLUMN / PARSE_ERROR paths — is covered by the dedicated parser tests
 * in task 3.3.
 *
 * Validates: Requirements 1.1, 1.2, 1.3
 */
describe("loadEmpowerDataset", () => {
  let dir: string;

  const ZIP_CSV = [
    "zip,county,county_fips,medicare_benes,power_dependent_dme,esrd_dialysis_any_dme,o2_services_any_dme,home_health_any_dme,hospice_any_dme,healthcare_srvc_any_dme,pct_power_dependent",
    "02360,Plymouth,25023,19641,444,11,111,62,12,196,2.26",
    "02780,Bristol,25005,11513,418,11,121,65,11,208,3.63",
    // Second Plymouth ZIP to exercise county grouping.
    "02341,Plymouth,25023,8000,120,0,40,30,10,90,1.5",
  ].join("\n");

  const COUNTY_CSV = [
    "county_fips,county,medicare_benes,power_dependent_dme,esrd_dialysis_any_dme,o2_services_any_dme,home_health_any_dme,hospice_any_dme,healthcare_srvc_any_dme,pct_power_dependent",
    "25023,Plymouth,130080,3662,242,893,577,243,1955,2.82",
    "25005,Bristol,133511,3933,253,958,660,253,2124,2.95",
  ].join("\n");

  const MONTHLY_CSV = [
    "zip,county,month,medicare_benes,power_dependent_dme",
    "02360,Plymouth,2026-10,19641,444",
    "02360,Plymouth,2026-09,19600,440",
  ].join("\n");

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "empower-loader-"));
    await Promise.all([
      writeFile(join(dir, "empower_ma_zip_oct2026.csv"), ZIP_CSV),
      writeFile(join(dir, "empower_ma_county_oct2026.csv"), COUNTY_CSV),
      writeFile(join(dir, "empower_ma_zip_monthly_2026.csv"), MONTHLY_CSV),
    ]);
  });

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  // The real data/ ZIP file includes ZIP 02542 (Barnstable) with 0 Medicare
  // beneficiaries and a blank derived pct_power_dependent. The loader treats
  // that empty derived column as 0, so the full dataset (510 ZIP rows) loads.
  it("loads the real data/ directory with all 510 zip records", async () => {
    const result = await loadEmpowerDataset();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.zip).toHaveLength(510);
    expect(result.value.zipByCode.size).toBe(510);
  });

  it("loads the three datasets and builds lookup indices", async () => {
    const result = await loadEmpowerDataset(dir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ds = result.value;

    // All three datasets populated with the fixture rows.
    expect(ds.zip).toHaveLength(3);
    expect(ds.county).toHaveLength(2);
    expect(ds.monthly).toHaveLength(2);

    // zipByCode indexes every ZIP record and preserves leading zeros.
    expect(ds.zipByCode.size).toBe(3);
    const plymouthZip = ds.zipByCode.get("02360");
    expect(plymouthZip?.zip).toBe("02360");
    expect(plymouthZip?.powerDependentDme.value).toBe(444);

    // zipsByCountyFips groups ZIP records by county FIPS for alert fan-out.
    expect(ds.zipsByCountyFips.get("25023")?.map((r) => r.zip).sort()).toEqual([
      "02341",
      "02360",
    ]);
    expect(ds.zipsByCountyFips.get("25005")?.map((r) => r.zip)).toEqual([
      "02780",
    ]);

    // Every ZIP record appears exactly once across the county groups.
    const grouped = [...ds.zipsByCountyFips.values()].reduce(
      (sum, group) => sum + group.length,
      0
    );
    expect(grouped).toBe(ds.zip.length);
  });
});
