import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";

import PlanPage from "@/app/plan/page";
import PlannerPage from "@/app/planner/page";

// Stub the Leaflet choropleth so it never executes under jsdom. The planner
// loads it via `dynamic(() => import("@/components/CountyChoropleth"), { ssr:
// false })`; under jsdom that dynamic import would actually mount Leaflet,
// which rejects the test GeoJSON and throws an unhandled error after the test
// finishes. The RankedList is the accessible path under test, not the map, so a
// trivial stub keeps the real assertions intact while keeping Leaflet out.
vi.mock("@/components/CountyChoropleth", () => ({
  __esModule: true,
  default: () => null,
}));

/**
 * Automated accessibility (axe) checks for the two main pages, /plan and
 * /planner. These assert the rendered DOM has no axe violations and back the
 * project's WCAG 2.2 AA target.
 *
 * Note: automated axe checks catch many issues but not all. Full WCAG
 * conformance requires manual testing with assistive technologies and expert
 * review (see .kiro steering: accessibility).
 *
 * Both pages are client components that fetch on mount. We stub `fetch` so the
 * network layer is deterministic and the pages render their real markup rather
 * than hanging. The planner's Leaflet map is loaded via `next/dynamic(..., {
 * ssr: false })`, so in jsdom it renders its (empty) fallback; the non-map
 * ranked-list path is the accessible alternative and is what we check here.
 */

// A minimal emPOWER wire payload (two ZIPs in one county) so the planner's
// ranked list renders real rows for axe to inspect.
const EMPOWER_WIRE = {
  zip: [
    {
      zip: "02138",
      county: "Middlesex",
      countyFips: "25017",
      medicareBenes: 1000,
      powerDependentDme: { value: 120, masked: false, label: "120" },
      esrdDialysisAnyDme: 0,
      o2ServicesAnyDme: 0,
      homeHealthAnyDme: 0,
      hospiceAnyDme: 0,
      healthcareSrvcAnyDme: 0,
      pctPowerDependent: 0,
      dataSource: "empower-aggregated-deidentified-medicare",
    },
    {
      zip: "02139",
      county: "Middlesex",
      countyFips: "25017",
      medicareBenes: 1000,
      powerDependentDme: { value: 11, masked: true, label: "11 or fewer" },
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

function envelope(value: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      value,
      source: "test",
      updatedAt: "2026-10-24T00:00:00.000Z",
    }),
  } as unknown as Response;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/empower")) return Promise.resolve(envelope(EMPOWER_WIRE));
      if (url.includes("/api/alerts")) return Promise.resolve(envelope([]));
      if (url.includes("/api/outages")) return Promise.resolve(envelope([]));
      if (url.includes("/api/translate")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: false }),
        } as unknown as Response);
      }
      return Promise.resolve(envelope(null));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Accessibility (axe) — main pages", () => {
  it("/plan (resident) has no axe violations", async () => {
    const { container } = render(<PlanPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("/planner (dashboard) has no axe violations", async () => {
    const { container, findByRole } = render(<PlannerPage />);
    // Wait for the emPOWER fetch to resolve so the ranked list (the non-map
    // accessible path) is in the DOM before we run axe.
    await findByRole("heading", { name: /outreach priority/i });
    await waitFor(() => {
      expect(container.querySelector("table")).not.toBeNull();
    });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
