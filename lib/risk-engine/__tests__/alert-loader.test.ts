import { describe, it, expect, vi, afterEach } from "vitest";

import {
  parseNwsResponse,
  mapAlertsToZips,
  compareSeverity,
  SEVERITY_ORDER,
  fetchActiveAlerts,
  __resetAlertCache,
  type NwsAlert,
} from "../alert-loader";
import { type EmpowerZipRecord } from "../empower-loader";
import { makeSmallCount, type Severity } from "../types";

/**
 * Unit tests for the NWS alert loader.
 *
 * `parseNwsResponse` and `mapAlertsToZips` are pure: the first turns a decoded
 * GeoJSON body into typed alerts (deriving county FIPS as `SAME.slice(1)`), the
 * second fans each alert out to every ZIP in its counties, keeping the highest
 * severity per ZIP. `fetchActiveAlerts` is the I/O edge with a 5-minute
 * in-memory cache and an injectable clock (`opts.now`). An unparseable body
 * yields `UNPARSEABLE_RESPONSE`; a failed request yields `FETCH_FAILED`.
 *
 * Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.7
 */

// --- Fixtures --------------------------------------------------------------

/** Build an EmpowerZipRecord with sensible defaults for mapping tests. */
function zipRecord(
  zip: string,
  countyFips: string,
  county = "Test County"
): EmpowerZipRecord {
  return {
    zip,
    county,
    countyFips,
    medicareBenes: 1000,
    powerDependentDme: makeSmallCount(50),
    esrdDialysisAnyDme: 0,
    o2ServicesAnyDme: 0,
    homeHealthAnyDme: 0,
    hospiceAnyDme: 0,
    healthcareSrvcAnyDme: 0,
    pctPowerDependent: 5,
    dataSource: "empower-aggregated-deidentified-medicare",
  };
}

/** Build a minimal NwsAlert for mapping tests. */
function alert(
  id: string,
  severity: Severity,
  countyFips: string[]
): NwsAlert {
  return {
    id,
    severity,
    sameCodes: countyFips.map((f) => `0${f}`),
    countyFips,
    dataSource: "nws-live-alert",
  };
}

/** A well-formed NWS GeoJSON body with one feature. */
function geoJsonBody(
  opts: {
    id?: string;
    severity?: string;
    headline?: string;
    same?: string[];
  } = {}
): unknown {
  return {
    features: [
      {
        properties: {
          id: opts.id ?? "alert-1",
          severity: opts.severity ?? "Severe",
          headline: opts.headline ?? "Test headline",
          geocode: { SAME: opts.same ?? ["025023", "025005"] },
        },
      },
    ],
  };
}

// --- parseNwsResponse ------------------------------------------------------

describe("parseNwsResponse", () => {
  it("parses a valid body and slices SAME codes to county FIPS (Req 2.4)", () => {
    const result = parseNwsResponse(geoJsonBody());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    const [a] = result.value;
    expect(a.id).toBe("alert-1");
    expect(a.severity).toBe("Severe");
    expect(a.headline).toBe("Test headline");
    expect(a.dataSource).toBe("nws-live-alert");
    // SAME → FIPS: drop the first digit of each 6-digit SAME code.
    expect(a.sameCodes).toEqual(["025023", "025005"]);
    expect(a.countyFips).toEqual(["25023", "25005"]);
  });

  it("maps an unrecognized severity to 'none' (Req 2.4)", () => {
    const result = parseNwsResponse(geoJsonBody({ severity: "Unknown" }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].severity).toBe("none");
  });

  it("returns UNPARSEABLE_RESPONSE on an empty object body (Req 2.3)", () => {
    const result = parseNwsResponse({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNPARSEABLE_RESPONSE");
  });

  it("returns UNPARSEABLE_RESPONSE on a null body (Req 2.3)", () => {
    const result = parseNwsResponse(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNPARSEABLE_RESPONSE");
  });
});

// --- severity ordering -----------------------------------------------------

describe("compareSeverity / SEVERITY_ORDER", () => {
  it("orders none < Minor < Moderate < Severe < Extreme", () => {
    expect(SEVERITY_ORDER.none).toBeLessThan(SEVERITY_ORDER.Minor);
    expect(SEVERITY_ORDER.Minor).toBeLessThan(SEVERITY_ORDER.Moderate);
    expect(SEVERITY_ORDER.Moderate).toBeLessThan(SEVERITY_ORDER.Severe);
    expect(SEVERITY_ORDER.Severe).toBeLessThan(SEVERITY_ORDER.Extreme);
  });

  it("returns sign by relative severity", () => {
    expect(compareSeverity("Minor", "Severe")).toBeLessThan(0);
    expect(compareSeverity("Extreme", "Moderate")).toBeGreaterThan(0);
    expect(compareSeverity("Severe", "Severe")).toBe(0);
  });
});

// --- mapAlertsToZips -------------------------------------------------------

describe("mapAlertsToZips", () => {
  it("fans an alert out to every ZIP in its county (Req 2.5)", () => {
    const index = new Map<string, EmpowerZipRecord[]>([
      ["25023", [zipRecord("02360", "25023"), zipRecord("02359", "25023")]],
    ]);

    const result = mapAlertsToZips([alert("a1", "Severe", ["25023"])], index);

    expect(result).toHaveLength(2);
    const zips = result.map((z) => z.zip).sort();
    expect(zips).toEqual(["02359", "02360"]);
    for (const z of result) {
      expect(z.severity).toBe("Severe");
      expect(z.alertIds).toEqual(["a1"]);
      expect(z.dataSource).toBe("nws-live-alert");
    }
  });

  it("keeps the HIGHER severity when two alerts hit the same county (Req 2.6)", () => {
    const index = new Map<string, EmpowerZipRecord[]>([
      ["25023", [zipRecord("02360", "25023")]],
    ]);

    // Lower-severity alert first, then a higher one: result must be the higher.
    const result = mapAlertsToZips(
      [alert("minor", "Minor", ["25023"]), alert("extreme", "Extreme", ["25023"])],
      index
    );

    expect(result).toHaveLength(1);
    const [z] = result;
    expect(z.severity).toBe("Extreme");
    expect(z.alertIds).toEqual(["minor", "extreme"]);
  });

  it("keeps the HIGHER severity regardless of alert order (Req 2.6)", () => {
    const index = new Map<string, EmpowerZipRecord[]>([
      ["25023", [zipRecord("02360", "25023")]],
    ]);

    // Higher-severity alert first: a later lower one must not override it.
    const result = mapAlertsToZips(
      [alert("extreme", "Extreme", ["25023"]), alert("minor", "Minor", ["25023"])],
      index
    );

    expect(result[0].severity).toBe("Extreme");
  });

  it("skips counties absent from the ZIP index (Req 2.5)", () => {
    const index = new Map<string, EmpowerZipRecord[]>([
      ["25023", [zipRecord("02360", "25023")]],
    ]);

    // Alert covers 25023 (present) and 25999 (absent).
    const result = mapAlertsToZips(
      [alert("a1", "Moderate", ["25999", "25023"])],
      index
    );

    expect(result.map((z) => z.zip)).toEqual(["02360"]);
  });
});

// --- fetchActiveAlerts cache + failures ------------------------------------

describe("fetchActiveAlerts", () => {
  afterEach(() => {
    // Always restore the global fetch stub and clear the module cache.
    vi.unstubAllGlobals();
    __resetAlertCache();
  });

  it("serves a cache hit within 5 minutes without re-fetching (Req 2.7)", async () => {
    __resetAlertCache();

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => geoJsonBody({ id: "cached", same: ["025023"] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const T = 1_000_000;
    const first = await fetchActiveAlerts({ now: T });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value[0].id).toBe("cached");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 100_000 ms later (< 300_000 TTL): served from cache, no new fetch.
    const second = await fetchActiveAlerts({ now: T + 100_000 });
    expect(second.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches once the 5-minute window has elapsed (Req 2.7)", async () => {
    __resetAlertCache();

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => geoJsonBody({ id: "fresh", same: ["025023"] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const T = 2_000_000;
    await fetchActiveAlerts({ now: T });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 400_000 ms later (> 300_000 TTL): cache is stale, so a new fetch runs.
    await fetchActiveAlerts({ now: T + 400_000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns FETCH_FAILED when the request rejects (Req 2.3)", async () => {
    __resetAlertCache();

    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchActiveAlerts({ now: 3_000_000 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FETCH_FAILED");
  });

  it("returns FETCH_FAILED on a non-ok HTTP response (Req 2.3)", async () => {
    __resetAlertCache();

    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchActiveAlerts({ now: 4_000_000 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FETCH_FAILED");
  });

  it("returns UNPARSEABLE_RESPONSE when the body is a bad shape (Req 2.3)", async () => {
    __resetAlertCache();

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}), // no `features` array
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchActiveAlerts({ now: 5_000_000 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNPARSEABLE_RESPONSE");
  });
});
