import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  countySummary,
  label,
  loadData,
  topZips,
  zipDetail,
} from "../lib.mjs";

/**
 * Unit tests for the PowerPlan MCP query helpers, plus one real stdio smoke
 * test of the server. Validates: Requirements 1.1-1.6 (wow-features).
 */

const data = loadData();
const HERE = dirname(fileURLToPath(import.meta.url));
// The stdio test needs the server's own dependencies
// (cd tools/powerplan-mcp && npm install). Skip it, visibly, when they are absent.
const SDK_INSTALLED = existsSync(
  join(HERE, "..", "node_modules", "@modelcontextprotocol", "sdk", "package.json"),
);

describe("powerplan-mcp lib", () => {
  it("labels 11 as '11 or fewer'", () => {
    expect(label(11)).toBe("11 or fewer");
    expect(label(12)).toBe("12");
  });

  it("loads all 510 ZIPs and 14 counties", () => {
    expect(data.zips).toHaveLength(510);
    expect(data.counties).toHaveLength(14);
  });

  it("county_summary matches the county CSV and accepts name or FIPS", () => {
    const byName = countySummary(data, "Plymouth");
    const byFips = countySummary(data, "25023");
    expect(byName.ok).toBe(true);
    expect(byFips).toEqual(byName);
    if (byName.ok) expect(byName.value.power_dependent_dme).toBe(3662);
  });

  it("county_summary rejects an unknown county with no figures", () => {
    const res = countySummary(data, "Atlantis");
    expect(res.ok).toBe(false);
    expect("value" in res).toBe(false);
  });

  it("top_zips is sorted descending and respects county and limit", () => {
    const res = topZips(data, { county: "Barnstable", limit: 5 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.zips).toHaveLength(5);
    for (const z of res.value.zips) expect(z.county).toBe("Barnstable");
    const counts = res.value.zips.map((z) => z.power_dependent_dme);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });

  it("zip_detail returns a ZIP and rejects an unknown one", () => {
    const ok = zipDetail(data, "02360");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.power_dependent_label).toBe("444");
    expect(zipDetail(data, "99999").ok).toBe(false);
  });

  it.skipIf(!SDK_INSTALLED)("answers over real MCP stdio (needs tools/powerplan-mcp npm install)", () => {
    const out = execFileSync(
      process.execPath,
      [join(HERE, "..", "smoke.mjs"), "zip_detail", JSON.stringify({ zip: "02360" })],
      { encoding: "utf8", timeout: 20_000 },
    );
    expect(JSON.parse(out).zip).toBe("02360");
  });
});
