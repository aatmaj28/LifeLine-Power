import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import PlannerPage from "@/app/planner/page";

// Stub the Leaflet choropleth so it never executes under jsdom. The planner
// loads it via `dynamic(() => import("@/components/CountyChoropleth"), { ssr:
// false })`; under jsdom that dynamic import would actually mount Leaflet,
// which rejects the test GeoJSON and throws an unhandled error after the test
// finishes. The RankedList (asserted below) is the non-map path to the same
// data, so a trivial stub keeps the real assertions intact while keeping
// Leaflet out.
vi.mock("@/components/CountyChoropleth", () => ({
  __esModule: true,
  default: () => null,
}));

/**
 * Integration tests for the planner dashboard page ({@link PlannerPage}).
 *
 * Requirements:
 *   8.1 — Storm Scenario is OFF by default; the dashboard shows live data only
 *         and never fetches the simulated outage layer until toggled on.
 *   8.2 — turning Storm Scenario ON adds the simulated outage layer.
 *   8.3 — ZIPs with an active simulated outage are flagged in the data
 *         (the ranked list reflects the outage in reasons / score).
 *   8.4 — the simulated layer is clearly badged "Simulated", never the whole
 *         dashboard, and carries a simulated DataSourceBadge.
 *   9.3 — emPOWER is labeled aggregated, de-identified Medicare data.
 *
 * The page renders CountyChoropleth via `dynamic(..., { ssr: false })`, which
 * under jsdom resolves to a client-only fallback; the RankedList is the full
 * non-map path to the same data and is the testable surface here. All network
 * I/O is stubbed on `global.fetch` so the page's three routes (/api/empower,
 * /api/alerts, /api/outages) resolve deterministically.
 */

const UPDATED_AT = "2026-10-15T12:00:00.000Z";

// A single Plymouth ZIP in the emPOWER wire shape (SmallCount object, since
// the real /api/empower route serializes EmpowerZipRecord that way). A second
// ZIP gives the ranked list more than one row and a non-trivial normalization.
const EMPOWER_WIRE = {
  zip: [
    {
      zip: "02360",
      county: "Plymouth",
      countyFips: "25023",
      medicareBenes: 1000,
      powerDependentDme: { value: 200, masked: false, label: "200" },
      esrdDialysisAnyDme: 0,
      o2ServicesAnyDme: 0,
      homeHealthAnyDme: 0,
      hospiceAnyDme: 0,
      healthcareSrvcAnyDme: 0,
      pctPowerDependent: 0,
      dataSource: "empower-aggregated-deidentified-medicare",
    },
    {
      zip: "02361",
      county: "Plymouth",
      countyFips: "25023",
      medicareBenes: 1000,
      powerDependentDme: { value: 400, masked: false, label: "400" },
      esrdDialysisAnyDme: 0,
      o2ServicesAnyDme: 0,
      homeHealthAnyDme: 0,
      hospiceAnyDme: 0,
      healthcareSrvcAnyDme: 0,
      pctPowerDependent: 0,
      dataSource: "empower-aggregated-deidentified-medicare",
    },
  ],
  county: [],
  monthly: [],
};

const OUTAGES = [
  {
    zip: "02360",
    active: true,
    start: "2026-10-15T18:00:00.000Z",
    simulated: true,
    dataSource: "simulated",
  },
];

/**
 * Install a `global.fetch` stub that answers each planner route with a success
 * envelope. Records every requested URL so a test can assert whether a route
 * was (or was not) hit.
 */
function stubFetch(): { urls: string[] } {
  const urls: string[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    urls.push(url);

    let body: unknown;
    if (url.includes("/api/empower")) {
      body = {
        ok: true,
        value: EMPOWER_WIRE,
        source: "empower-aggregated-deidentified-medicare",
        updatedAt: UPDATED_AT,
      };
    } else if (url.includes("/api/alerts")) {
      body = {
        ok: true,
        value: [],
        source: "nws-live-alert",
        updatedAt: UPDATED_AT,
      };
    } else if (url.includes("/api/outages")) {
      body = {
        ok: true,
        value: OUTAGES,
        source: "simulated",
        updatedAt: UPDATED_AT,
      };
    } else {
      return new Response("not found", { status: 404 });
    }

    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as unknown as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return { urls };
}

/** The row (<tr>) for a given ZIP, located via its row-header cell. */
function rowForZip(zip: string): HTMLElement {
  const header = screen.getByRole("rowheader", { name: zip });
  return header.closest("tr") as HTMLElement;
}

describe("PlannerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("labels emPOWER as aggregated, de-identified Medicare data (Req 9.3)", async () => {
    stubFetch();
    render(<PlannerPage />);

    // The friendly emPOWER DataSourceBadge label appears once the base data
    // loads.
    expect(
      await screen.findByText(
        "HHS emPOWER (aggregated, de-identified Medicare data)",
      ),
    ).toBeInTheDocument();

    // The page note also calls the counts aggregated, de-identified Medicare
    // data (not a list of individuals) — distinct from the badge label.
    expect(
      screen.getByText(/aggregated, de-identified\s+Medicare data, not a list of individuals/i),
    ).toBeInTheDocument();
  });

  it("is live-only by default: no simulated badge, /api/outages not fetched (Req 8.1)", async () => {
    const { urls } = stubFetch();
    render(<PlannerPage />);

    // Wait for the base data to load (ranked list row present).
    expect(
      await screen.findByRole("rowheader", { name: "02360" }),
    ).toBeInTheDocument();

    // No simulated-outage badge while Storm Scenario is off.
    expect(screen.queryByText("Simulated outages")).not.toBeInTheDocument();

    // The outage route was never requested before toggling.
    expect(urls.some((u) => u.includes("/api/outages"))).toBe(false);
  });

  it("adds the simulated outage layer and badge when Storm Scenario is on (Req 8.2, 8.4)", async () => {
    const { urls } = stubFetch();
    render(<PlannerPage />);

    // Base data loaded.
    await screen.findByRole("rowheader", { name: "02360" });

    // Toggle Storm Scenario on.
    const toggle = screen.getByRole("checkbox", {
      name: /Simulate a nor.?easter with outages over Eastern Massachusetts/i,
    });
    fireEvent.click(toggle);

    // The outage route is fetched once the scenario turns on.
    await waitFor(() => {
      expect(urls.some((u) => u.includes("/api/outages"))).toBe(true);
    });

    // The simulated layer is badged as simulated...
    expect(await screen.findByText("Simulated outages")).toBeInTheDocument();

    // ...and a DataSourceBadge with the simulated source label is shown.
    expect(await screen.findByText("Simulated")).toBeInTheDocument();
  });

  it("flags active-outage ZIPs in the ranked list when the scenario is on (Req 8.3)", async () => {
    stubFetch();
    render(<PlannerPage />);

    await screen.findByRole("rowheader", { name: "02360" });

    // Baseline score for 02360 with no outage: dependents only.
    const scoreBefore = within(rowForZip("02360"))
      .getByText(/^\d+\.\d{2}$/)
      .textContent?.trim();

    // Turn on Storm Scenario; 02360 has an active simulated outage.
    const toggle = screen.getByRole("checkbox", {
      name: /Simulate a nor.?easter with outages over Eastern Massachusetts/i,
    });
    fireEvent.click(toggle);

    // The outage layer resolves; the 02360 row now shows an active-outage
    // reason, which is the honest signal that the ZIP is flagged.
    await waitFor(() => {
      expect(
        within(rowForZip("02360")).getByText(/active outage bonus/i),
      ).toBeInTheDocument();
    });

    // The outage bonus also raises the ZIP's score versus the live-only view.
    const scoreAfter = within(rowForZip("02360"))
      .getByText(/^\d+\.\d{2}$/)
      .textContent?.trim();
    expect(Number(scoreAfter)).toBeGreaterThan(Number(scoreBefore));
  });
});
