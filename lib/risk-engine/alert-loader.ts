// Alert_Loader — fetches live National Weather Service active alerts for
// Massachusetts, maps each alert to counties (via the SAME code), and fans the
// alert out to every ZIP in that county.
//
// This module keeps all non-determinism (network, clock, cache) at the edge in
// `fetchActiveAlerts` (implemented in a later task). The functions below are
// PURE: `parseNwsResponse` turns an already-decoded response body into typed
// alerts, and `mapAlertsToZips` turns alerts + the ZIP index into per-ZIP
// alerts. Both are directly property-testable with no I/O.
//
// Honesty rules enforced here:
// - An unparseable body returns `UNPARSEABLE_RESPONSE`; alerts are never
//   fabricated to fill in a bad response.
// - Every emitted record is stamped with the live NWS source.

import { type EmpowerZipRecord } from "./empower-loader";
import { type Result, type Severity } from "./types";

const NWS_SOURCE = "nws-live-alert" as const;

export interface NwsAlert {
  id: string;
  severity: Severity;
  /** 6-digit SAME codes from the alert's `geocode.SAME`. */
  sameCodes: string[];
  /** Last 5 digits of each SAME code (the county FIPS). */
  countyFips: string[];
  headline?: string;
  dataSource: "nws-live-alert";
}

export interface ZipAlert {
  zip: string;
  /** Highest severity affecting the ZIP. */
  severity: Severity;
  alertIds: string[];
  dataSource: "nws-live-alert";
}

/**
 * Severity ordering: none < Minor < Moderate < Severe < Extreme. Used to rank
 * the severity of overlapping alerts affecting the same ZIP.
 */
export const SEVERITY_ORDER: Record<Severity, number> = {
  none: 0,
  Minor: 1,
  Moderate: 2,
  Severe: 3,
  Extreme: 4,
};

/**
 * Compare two severities by {@link SEVERITY_ORDER}. Returns a negative number
 * when `a` is less severe than `b`, zero when equal, and a positive number when
 * `a` is more severe.
 */
export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}

/**
 * Map an NWS severity string onto the engine's {@link Severity} type. NWS
 * reports "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown"; anything
 * unrecognized or missing (including "Unknown") collapses to "none" so the
 * engine never invents a severity it did not receive.
 */
function normalizeSeverity(value: unknown): Severity {
  switch (value) {
    case "Extreme":
      return "Extreme";
    case "Severe":
      return "Severe";
    case "Moderate":
      return "Moderate";
    case "Minor":
      return "Minor";
    default:
      return "none";
  }
}

/** Narrow an unknown value to a plain object with string keys. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parse a raw NWS GeoJSON body into typed {@link NwsAlert}s. The expected shape
 * is `{ features: [{ properties: { id, severity, headline, geocode: { SAME:
 * string[] } } }] }`. Each 6-digit SAME code yields a county FIPS via
 * `sameCode.slice(1)`.
 *
 * If the body is not an object with a `features` array, returns
 * `UNPARSEABLE_RESPONSE` — no alerts are fabricated.
 */
export function parseNwsResponse(body: unknown): Result<NwsAlert[]> {
  if (!isObject(body) || !Array.isArray(body.features)) {
    return {
      ok: false,
      error: {
        code: "UNPARSEABLE_RESPONSE",
        message:
          "NWS response is not an object with a `features` array.",
      },
    };
  }

  const alerts: NwsAlert[] = [];
  for (const feature of body.features) {
    if (!isObject(feature)) continue;
    const properties = feature.properties;
    if (!isObject(properties)) continue;

    const id =
      typeof properties.id === "string"
        ? properties.id
        : typeof feature.id === "string"
          ? feature.id
          : "";

    const severity = normalizeSeverity(properties.severity);

    const headline =
      typeof properties.headline === "string"
        ? properties.headline
        : undefined;

    const geocode = properties.geocode;
    const rawSame =
      isObject(geocode) && Array.isArray(geocode.SAME) ? geocode.SAME : [];
    const sameCodes = rawSame.filter(
      (code): code is string => typeof code === "string"
    );
    const countyFips = sameCodes.map((code) => code.slice(1));

    alerts.push({
      id,
      severity,
      sameCodes,
      countyFips,
      ...(headline !== undefined ? { headline } : {}),
      dataSource: NWS_SOURCE,
    });
  }

  return { ok: true, value: alerts };
}

/**
 * Fan each alert out to every ZIP in the counties it covers, keeping the
 * highest severity per ZIP (via {@link compareSeverity}) and collecting the
 * contributing alert ids. ZIP-less counties (FIPS not present in the index) are
 * skipped. The output is a per-ZIP view suitable for scoring.
 */
export function mapAlertsToZips(
  alerts: NwsAlert[],
  zipsByCountyFips: Map<string, EmpowerZipRecord[]>
): ZipAlert[] {
  const byZip = new Map<string, ZipAlert>();

  for (const alert of alerts) {
    for (const fips of alert.countyFips) {
      const zips = zipsByCountyFips.get(fips);
      if (!zips) continue;

      for (const record of zips) {
        const existing = byZip.get(record.zip);
        if (existing) {
          if (compareSeverity(alert.severity, existing.severity) > 0) {
            existing.severity = alert.severity;
          }
          if (!existing.alertIds.includes(alert.id)) {
            existing.alertIds.push(alert.id);
          }
        } else {
          byZip.set(record.zip, {
            zip: record.zip,
            severity: alert.severity,
            alertIds: [alert.id],
            dataSource: NWS_SOURCE,
          });
        }
      }
    }
  }

  return Array.from(byZip.values());
}

// --- I/O edge: live fetch with a 5-minute in-memory cache -------------------

/** NWS active-alerts endpoint, scoped to Massachusetts. */
const NWS_ALERTS_URL = "https://api.weather.gov/alerts/active?area=MA";

/** How long a cached response stays fresh, in milliseconds (5 minutes). */
const CACHE_TTL_MS = 300_000;

/**
 * NWS asks every client to identify itself with a descriptive User-Agent so
 * they can contact the operator if a client misbehaves.
 */
const NWS_HEADERS: Record<string, string> = {
  "User-Agent": "PowerPlan/1.0 (storm-prep hackathon project)",
  Accept: "application/geo+json",
};

/** Module-level cache: the last successful fetch and when it happened. */
let alertCache: { fetchedAt: number; value: NwsAlert[] } | null = null;

/**
 * Reset the in-memory alert cache. Exposed for tests so each case starts from a
 * known (empty) cache state; not part of the engine's public API.
 */
export function __resetAlertCache(): void {
  alertCache = null;
}

/**
 * Fetch active Massachusetts NWS alerts, parsed into typed {@link NwsAlert}s.
 *
 * All non-determinism lives here: the network request, the clock, and the
 * in-memory cache. A successful fetch is cached with its `fetchedAt`
 * timestamp; a subsequent call within {@link CACHE_TTL_MS} of that timestamp
 * returns the cached value without hitting the network. `opts.now` is
 * injectable so tests can exercise cache hits/expiry deterministically; it
 * defaults to `Date.now()`.
 *
 * Honesty rules: a failed request (network error or non-2xx response) returns
 * `FETCH_FAILED`, and an unparseable body returns `UNPARSEABLE_RESPONSE` (via
 * {@link parseNwsResponse}). No alerts are ever fabricated to paper over a
 * failure, and a failure never overwrites a previously cached good value.
 */
export async function fetchActiveAlerts(opts?: {
  now?: number;
}): Promise<Result<NwsAlert[]>> {
  const now = opts?.now ?? Date.now();

  if (alertCache && now - alertCache.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, value: alertCache.value };
  }

  let res: Response;
  try {
    res = await fetch(NWS_ALERTS_URL, { headers: NWS_HEADERS });
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "FETCH_FAILED",
        message:
          err instanceof Error
            ? `NWS request failed: ${err.message}`
            : "NWS request failed.",
      },
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: {
        code: "FETCH_FAILED",
        message: `NWS request failed with status ${res.status}.`,
      },
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "UNPARSEABLE_RESPONSE",
        message:
          err instanceof Error
            ? `NWS response body is not valid JSON: ${err.message}`
            : "NWS response body is not valid JSON.",
      },
    };
  }

  const parsed = parseNwsResponse(body);
  if (!parsed.ok) {
    return parsed;
  }

  alertCache = { fetchedAt: now, value: parsed.value };
  return { ok: true, value: parsed.value };
}
