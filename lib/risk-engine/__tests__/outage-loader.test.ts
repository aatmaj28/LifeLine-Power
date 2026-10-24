import { describe, it, expect } from "vitest";
import { join } from "node:path";

import { validateOutages, loadSimulatedOutages } from "../outage-loader";

/**
 * Unit tests for the simulated-outage loader.
 *
 * `validateOutages` is pure over already-parsed JSON. It accepts an array of
 * conforming records, stamps each with `simulated: true` / `dataSource:
 * "simulated"`, and fails fast with `SCHEMA_ERROR` naming the offending field
 * on the first non-conforming record. `loadSimulatedOutages` is the I/O wrapper
 * reading the real `data/sim-outages.json`.
 *
 * Validates: Requirements 3.3, 3.4, 3.5
 */
describe("validateOutages", () => {
  it("accepts a valid array and stamps every record simulated/dataSource", () => {
    const input = [
      {
        zip: "02360",
        county: "Plymouth",
        active: true,
        start: "2026-10-23T02:00:00-04:00",
        estimatedRestore: "2026-10-24T18:00:00-04:00",
      },
      {
        county: "Middlesex",
        active: false,
        start: "2026-10-23T05:00:00-04:00",
      },
    ];

    const result = validateOutages(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(2);
    for (const record of result.value) {
      expect(record.simulated).toBe(true);
      expect(record.dataSource).toBe("simulated");
    }

    // Field values are carried through faithfully.
    expect(result.value[0]).toEqual({
      zip: "02360",
      county: "Plymouth",
      active: true,
      start: "2026-10-23T02:00:00-04:00",
      estimatedRestore: "2026-10-24T18:00:00-04:00",
      simulated: true,
      dataSource: "simulated",
    });
    // Optional estimatedRestore is omitted when absent.
    expect(result.value[1].estimatedRestore).toBeUndefined();
  });

  it("rejects non-array input with SCHEMA_ERROR", () => {
    const result = validateOutages({ not: "an array" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_ERROR");
  });

  it("rejects a record missing boolean active with SCHEMA_ERROR field 'active'", () => {
    const result = validateOutages([
      { zip: "02360", start: "2026-10-23T02:00:00-04:00" },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_ERROR");
    expect(result.error.field).toBe("active");
  });

  it("rejects a record missing start with SCHEMA_ERROR field 'start'", () => {
    const result = validateOutages([{ zip: "02360", active: true }]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_ERROR");
    expect(result.error.field).toBe("start");
  });

  it("rejects a record with neither zip nor county with SCHEMA_ERROR field 'zip'", () => {
    const result = validateOutages([
      { active: true, start: "2026-10-23T02:00:00-04:00" },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_ERROR");
    expect(result.error.field).toBe("zip");
  });

  it("rejects a bad estimatedRestore type with SCHEMA_ERROR field 'estimatedRestore'", () => {
    const result = validateOutages([
      {
        zip: "02360",
        active: true,
        start: "2026-10-23T02:00:00-04:00",
        estimatedRestore: 12345,
      },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("SCHEMA_ERROR");
    expect(result.error.field).toBe("estimatedRestore");
  });
});

describe("loadSimulatedOutages", () => {
  it("loads and validates the real data/sim-outages.json", async () => {
    const path = join(process.cwd(), "data", "sim-outages.json");
    const result = await loadSimulatedOutages(path);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(8);
    for (const record of result.value) {
      expect(record.simulated).toBe(true);
      expect(record.dataSource).toBe("simulated");
      expect(typeof record.active).toBe("boolean");
      expect(typeof record.start).toBe("string");
      expect(
        typeof record.zip === "string" || typeof record.county === "string"
      ).toBe(true);
    }
  });
});
