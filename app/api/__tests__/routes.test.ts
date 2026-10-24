// app/api/__tests__/routes.test.ts
//
// Integration/example tests for the four PowerPlan API routes (task 10.5).
//
// Each route gets one success example (real data / real fall-through) and one
// forced-failure example that asserts the HTTP status + engine error code and
// that NO fabricated data leaks into the error body. The translate route also
// exercises provider selection end-to-end (template fall-through with no AI
// env) and per-language cache reuse (Requirement 6.8).
//
// These invoke the route handlers directly — `GET()` / `POST(request)` — and
// read the returned `Response` via `await res.json()` / `res.status`, which is
// exactly how Next's `NextResponse.json(...)` is consumed.
//
// The engine barrel (`@/lib/risk-engine`) is mocked with `importOriginal` so
// the loaders can be forced to fail per test while every other export keeps its
// real implementation. A mutable `engineControl` object drives each loader's
// behavior; because the empower/outages routes wrap their loader in a 5-minute
// module-level TTL cache, those tests `vi.resetModules()` and re-import the
// route after setting the desired behavior so the cache starts empty.

import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  EmpowerDataset,
  NwsAlert,
  SimulatedOutage,
  Result,
} from "@/lib/risk-engine";

// --- Engine mock ------------------------------------------------------------
//
// A mutable controller the hoisted `vi.mock` factory reads. `null` means "use
// the real implementation"; a function means "return this instead".
type EmpowerResult = Result<EmpowerDataset>;
type AlertResult = Result<NwsAlert[]>;
type OutageResult = Result<SimulatedOutage[]>;

const engineControl: {
  loadEmpowerDataset: (() => Promise<EmpowerResult>) | null;
  fetchActiveAlerts: (() => Promise<AlertResult>) | null;
  loadSimulatedOutages: (() => Promise<OutageResult>) | null;
} = {
  loadEmpowerDataset: null,
  fetchActiveAlerts: null,
  loadSimulatedOutages: null,
};

vi.mock("@/lib/risk-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/risk-engine")>();
  return {
    ...actual,
    loadEmpowerDataset: (...args: unknown[]) =>
      engineControl.loadEmpowerDataset
        ? engineControl.loadEmpowerDataset()
        : (actual.loadEmpowerDataset as (...a: unknown[]) => unknown)(...args),
    fetchActiveAlerts: (...args: unknown[]) =>
      engineControl.fetchActiveAlerts
        ? engineControl.fetchActiveAlerts()
        : (actual.fetchActiveAlerts as (...a: unknown[]) => unknown)(...args),
    loadSimulatedOutages: (...args: unknown[]) =>
      engineControl.loadSimulatedOutages
        ? engineControl.loadSimulatedOutages()
        : (actual.loadSimulatedOutages as (...a: unknown[]) => unknown)(...args),
  };
});

beforeEach(() => {
  engineControl.loadEmpowerDataset = null;
  engineControl.fetchActiveAlerts = null;
  engineControl.loadSimulatedOutages = null;
  vi.resetModules();
});

/** Build a fresh POST Request with a JSON body for the translate route. */
function jsonPost(body: unknown): Request {
  return new Request("http://localhost/api/translate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- GET /api/empower -------------------------------------------------------

describe("GET /api/empower", () => {
  it("success: loads the real dataset with its provenance", async () => {
    const { GET } = await import("@/app/api/empower/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.value).toBeDefined();
    expect(body.source).toBe("empower-aggregated-deidentified-medicare");
    expect(typeof body.updatedAt).toBe("string");
    expect(body.error).toBeUndefined();
  });

  it("forced failure: PARSE_ERROR → 500 with the code and no value", async () => {
    engineControl.loadEmpowerDataset = async () => ({
      ok: false,
      error: { code: "PARSE_ERROR", message: "bad row 42" },
    });

    const { GET } = await import("@/app/api/empower/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("PARSE_ERROR");
    // Honesty rule: an error body must never carry fabricated data.
    expect("value" in body).toBe(false);
  });
});

// --- GET /api/alerts --------------------------------------------------------

describe("GET /api/alerts", () => {
  it("success: returns live alerts with the nws-live-alert source", async () => {
    engineControl.fetchActiveAlerts = async () => ({ ok: true, value: [] });

    const { GET } = await import("@/app/api/alerts/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.value).toEqual([]);
    expect(body.source).toBe("nws-live-alert");
    expect(typeof body.updatedAt).toBe("string");
  });

  it("forced failure: FETCH_FAILED → 502 with the code and no alerts", async () => {
    engineControl.fetchActiveAlerts = async () => ({
      ok: false,
      error: { code: "FETCH_FAILED", message: "NWS unreachable" },
    });

    const { GET } = await import("@/app/api/alerts/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("FETCH_FAILED");
    // Never fabricate alerts on an upstream failure.
    expect("value" in body).toBe(false);
  });
});

// --- GET /api/outages -------------------------------------------------------

describe("GET /api/outages", () => {
  it("success: loads the simulated outages with source 'simulated'", async () => {
    const { GET } = await import("@/app/api/outages/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.value).toBeDefined();
    expect(body.source).toBe("simulated");
    expect(typeof body.updatedAt).toBe("string");
  });

  it("forced failure: SCHEMA_ERROR → 500 with the code and no value", async () => {
    engineControl.loadSimulatedOutages = async () => ({
      ok: false,
      error: { code: "SCHEMA_ERROR", message: "missing field 'zip'" },
    });

    const { GET } = await import("@/app/api/outages/route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("SCHEMA_ERROR");
    expect("value" in body).toBe(false);
  });
});

// --- POST /api/translate ----------------------------------------------------

describe("POST /api/translate", () => {
  it("success: Spanish falls back to the template provider with both safety lines", async () => {
    // No AWS_* / AI_API_KEY in the test env → the chain falls through to the
    // English templates, and the fixed Spanish safety lines are overlaid last.
    const { POST } = await import("@/app/api/translate/route");
    const res = await POST(jsonPost({ language: "es" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.language).toBe("es");
    expect(body.provider).toBe("template");
    expect(body.copy.catalog).toBeDefined();

    // Both fixed Spanish safety lines are present verbatim (never AI-translated).
    expect(body.copy.safetyLine1).toBe(
      "Si su equipo se detiene y usted está en peligro, llame al 911.",
    );
    expect(body.copy.safetyLine2).toBe(
      "Hable con su médico o su proveedor de equipos sobre su plan de respaldo.",
    );
  });

  it("per-language cache: a second call for the same language returns identical copy", async () => {
    // Same fresh module instance so the per-language cache is exercised: the
    // first call resolves+caches, the second must return the cached copy.
    const { POST } = await import("@/app/api/translate/route");

    const first = await (await POST(jsonPost({ language: "pt" }))).json();
    const second = await (await POST(jsonPost({ language: "pt" }))).json();

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    // Cache reuse: byte-for-byte identical resolved copy on the repeat call.
    expect(second).toEqual(first);
    expect(second.language).toBe("pt");
    expect(second.provider).toBe("template");
  });

  it("invalid/missing language falls back to 'en' and still succeeds", async () => {
    const { POST } = await import("@/app/api/translate/route");

    const bogus = await (await POST(jsonPost({ language: "xx" }))).json();
    expect(bogus.ok).toBe(true);
    expect(bogus.language).toBe("en");
    expect(bogus.copy.catalog).toBeDefined();
    // English fixed safety line present.
    expect(bogus.copy.safetyLine1).toBe(
      "If your device stops and you are in danger, call 911.",
    );

    // A missing language field behaves the same way.
    const missing = await (await POST(jsonPost({}))).json();
    expect(missing.ok).toBe(true);
    expect(missing.language).toBe("en");
  });
});
