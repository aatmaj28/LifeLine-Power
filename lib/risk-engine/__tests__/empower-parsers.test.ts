import { describe, it, expect } from "vitest";
import {
  parseZipCsv,
  parseCountyCsv,
  parseMonthlyCsv,
} from "../empower-loader";

/**
 * Unit tests for the pure emPOWER CSV parsers (parseZipCsv, parseCountyCsv,
 * parseMonthlyCsv). These exercise the honesty guarantees the parsers encode:
 * leading-zero ZIPs survive as text, a power_dependent_dme value of 11 surfaces
 * as "11 or fewer", a dropped required column fails fast with MISSING_COLUMN,
 * and an unparseable strict numeric field rejects with PARSE_ERROR naming the
 * field. The lenient pct_power_dependent (empty → 0) is documented too.
 *
 * Validates: Requirements 1.4, 1.6, 1.7
 */

// Canonical, well-formed headers for each dataset.
const ZIP_HEADER =
  "zip,county,county_fips,medicare_benes,power_dependent_dme,esrd_dialysis_any_dme,o2_services_any_dme,home_health_any_dme,hospice_any_dme,healthcare_srvc_any_dme,pct_power_dependent";
const COUNTY_HEADER =
  "county_fips,county,medicare_benes,power_dependent_dme,esrd_dialysis_any_dme,o2_services_any_dme,home_health_any_dme,hospice_any_dme,healthcare_srvc_any_dme,pct_power_dependent";
const MONTHLY_HEADER = "zip,county,month,medicare_benes,power_dependent_dme";

describe("parseZipCsv", () => {
  it("preserves a leading-zero ZIP as a string (Req 1.4)", () => {
    const csv = [
      ZIP_HEADER,
      "02360,Plymouth,25023,19641,444,10,111,62,12,196,2.26",
    ].join("\n");

    const result = parseZipCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [record] = result.value;
    expect(record.zip).toBe("02360");
    // Guard against numeric coercion dropping the leading zero.
    expect(typeof record.zip).toBe("string");
    expect(record.countyFips).toBe("25023");
  });

  it("surfaces power_dependent_dme === 11 as masked ' 11 or fewer' (Req 1.6)", () => {
    const csv = [
      ZIP_HEADER,
      // power_dependent_dme = 11 → should be masked.
      "02360,Plymouth,25023,19641,11,10,111,62,12,196,2.26",
    ].join("\n");

    const result = parseZipCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [record] = result.value;
    expect(record.powerDependentDme.value).toBe(11);
    expect(record.powerDependentDme.masked).toBe(true);
    expect(record.powerDependentDme.label).toBe("11 or fewer");
  });

  it("does not mask a non-11 power_dependent_dme value (Req 1.6)", () => {
    const csv = [
      ZIP_HEADER,
      "02360,Plymouth,25023,19641,444,10,111,62,12,196,2.26",
    ].join("\n");

    const result = parseZipCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [record] = result.value;
    expect(record.powerDependentDme.value).toBe(444);
    expect(record.powerDependentDme.masked).toBe(false);
    expect(record.powerDependentDme.label).toBe("444");
  });

  it("rejects a dropped required column with MISSING_COLUMN naming the field (Req 1.7)", () => {
    // Remove the required `medicare_benes` column from the header entirely.
    const brokenHeader =
      "zip,county,county_fips,power_dependent_dme,esrd_dialysis_any_dme,o2_services_any_dme,home_health_any_dme,hospice_any_dme,healthcare_srvc_any_dme,pct_power_dependent";
    const csv = [
      brokenHeader,
      "02360,Plymouth,25023,444,10,111,62,12,196,2.26",
    ].join("\n");

    const result = parseZipCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("MISSING_COLUMN");
    expect(result.error.field).toBe("medicare_benes");
  });

  it("rejects a non-numeric strict numeric field with PARSE_ERROR naming the field (Req 1.7)", () => {
    const csv = [
      ZIP_HEADER,
      // medicare_benes is non-numeric.
      "02360,Plymouth,25023,not-a-number,444,10,111,62,12,196,2.26",
    ].join("\n");

    const result = parseZipCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.field).toBe("medicare_benes");
  });

  it("rejects an empty strict numeric field with PARSE_ERROR naming the field (Req 1.7)", () => {
    const csv = [
      ZIP_HEADER,
      // medicare_benes is empty (trailing/empty cell).
      "02360,Plymouth,25023,,444,10,111,62,12,196,2.26",
    ].join("\n");

    const result = parseZipCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.field).toBe("medicare_benes");
  });

  it("parses an empty pct_power_dependent as 0 (documents the lenient derived column)", () => {
    const csv = [
      ZIP_HEADER,
      // Trailing empty cell for the derived pct_power_dependent column.
      "02542,Barnstable,25001,0,0,0,0,0,0,0,",
    ].join("\n");

    const result = parseZipCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [record] = result.value;
    expect(record.pctPowerDependent).toBe(0);
  });
});

describe("parseCountyCsv", () => {
  it("rejects a dropped required column with MISSING_COLUMN naming the field (Req 1.7)", () => {
    // Remove the required `county_fips` column from the header.
    const brokenHeader =
      "county,medicare_benes,power_dependent_dme,esrd_dialysis_any_dme,o2_services_any_dme,home_health_any_dme,hospice_any_dme,healthcare_srvc_any_dme,pct_power_dependent";
    const csv = [
      brokenHeader,
      "Plymouth,130080,3662,242,893,577,243,1955,2.82",
    ].join("\n");

    const result = parseCountyCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("MISSING_COLUMN");
    expect(result.error.field).toBe("county_fips");
  });

  it("surfaces power_dependent_dme === 11 as masked '11 or fewer' (Req 1.6)", () => {
    const csv = [
      COUNTY_HEADER,
      "25023,Plymouth,130080,11,242,893,577,243,1955,2.82",
    ].join("\n");

    const result = parseCountyCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [record] = result.value;
    expect(record.countyFips).toBe("25023");
    expect(record.powerDependentDme.masked).toBe(true);
    expect(record.powerDependentDme.label).toBe("11 or fewer");
  });

  it("rejects a non-numeric strict numeric field with PARSE_ERROR naming the field (Req 1.7)", () => {
    const csv = [
      COUNTY_HEADER,
      "25023,Plymouth,oops,3662,242,893,577,243,1955,2.82",
    ].join("\n");

    const result = parseCountyCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.field).toBe("medicare_benes");
  });
});

describe("parseMonthlyCsv", () => {
  it("preserves a leading-zero ZIP as a string (Req 1.4)", () => {
    const csv = [MONTHLY_HEADER, "02360,Plymouth,2026-10,19641,444"].join("\n");

    const result = parseMonthlyCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [record] = result.value;
    expect(record.zip).toBe("02360");
    expect(typeof record.zip).toBe("string");
    expect(record.month).toBe("2026-10");
  });

  it("surfaces power_dependent_dme === 11 as masked '11 or fewer' (Req 1.6)", () => {
    const csv = [MONTHLY_HEADER, "02360,Plymouth,2026-10,19641,11"].join("\n");

    const result = parseMonthlyCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [record] = result.value;
    expect(record.powerDependentDme.masked).toBe(true);
    expect(record.powerDependentDme.label).toBe("11 or fewer");
  });

  it("rejects a dropped required column with MISSING_COLUMN naming the field (Req 1.7)", () => {
    // Remove the required `month` column.
    const brokenHeader = "zip,county,medicare_benes,power_dependent_dme";
    const csv = [brokenHeader, "02360,Plymouth,19641,444"].join("\n");

    const result = parseMonthlyCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("MISSING_COLUMN");
    expect(result.error.field).toBe("month");
  });

  it("rejects a non-numeric strict numeric field with PARSE_ERROR naming the field (Req 1.7)", () => {
    const csv = [MONTHLY_HEADER, "02360,Plymouth,2026-10,nope,444"].join("\n");

    const result = parseMonthlyCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.code).toBe("PARSE_ERROR");
    expect(result.error.field).toBe("medicare_benes");
  });
});
