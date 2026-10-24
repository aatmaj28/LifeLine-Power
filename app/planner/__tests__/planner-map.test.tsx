import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import PlannerPage from "@/app/planner/page";

/**
 * Map <-> list interaction on /planner (wow-features Requirements 3.4-3.8).
 *
 * Leaflet cannot run under jsdom, so CountyChoropleth is replaced by a stub that
 * records the props it receives and exposes a button that "clicks" a ZIP circle.
 * That lets us assert the real page wiring: selection, highlight, pan target,
 * and layer toggles.
 */

const mapProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock("@/components/CountyChoropleth", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mapProps.current = props;
    const onSelectZip = props.onSelectZip as ((zip: string) => void) | undefined;
    return (
      <div data-testid="map-stub" data-selected-zip={String(props.selectedZip ?? "")}>
        <button type="button" onClick={() => onSelectZip?.("02139")}>
          Map circle 02139
        </button>
      </div>
    );
  },
}));

function zipRecord(zip: string, county: string, countyFips: string, value: number) {
  return {
    zip,
    county,
    countyFips,
    medicareBenes: 1000,
    powerDependentDme: { value, masked: value === 11, label: value === 11 ? "11 or fewer" : String(value) },
    esrdDialysisAnyDme: 0,
    o2ServicesAnyDme: 0,
    homeHealthAnyDme: 0,
    hospiceAnyDme: 0,
    healthcareSrvcAnyDme: 0,
    pctPowerDependent: 0,
    dataSource: "empower-aggregated-deidentified-medicare",
  };
}

const EMPOWER = {
  zip: [
    zipRecord("02360", "Plymouth", "25023", 444),
    zipRecord("02301", "Plymouth", "25023", 363),
    zipRecord("02139", "Middlesex", "25017", 120),
  ],
  county: [],
  monthly: [],
};

const ALERTS = [
  {
    id: "a1",
    severity: "Severe",
    sameCodes: ["025023"],
    countyFips: ["25023"],
    dataSource: "nws-live-alert",
  },
];

beforeEach(() => {
  mapProps.current = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const value = url.includes("/api/empower")
        ? EMPOWER
        : url.includes("/api/alerts")
          ? ALERTS
          : [];
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, value, source: "test", updatedAt: "2026-10-24T00:00:00.000Z" }),
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function row(zip: string): HTMLElement {
  return screen.getByRole("rowheader", { name: zip }).closest("tr") as HTMLElement;
}

describe("Planner map and list", () => {
  it("clicking a ZIP on the map highlights its row and filters to its county", async () => {
    render(<PlannerPage />);
    await screen.findByRole("rowheader", { name: "02360" });

    // The map is loaded via next/dynamic, so wait for it rather than assume it.
    fireEvent.click(await screen.findByRole("button", { name: "Map circle 02139" }));

    await waitFor(() => expect(row("02139")).toHaveAttribute("aria-current", "true"));
    // Filtered to Middlesex: the Plymouth ZIPs are no longer listed.
    expect(screen.queryByRole("rowheader", { name: "02360" })).not.toBeInTheDocument();
    expect(screen.getByTestId("map-stub")).toHaveAttribute("data-selected-zip", "02139");
  });

  it("selecting a row pans the map to that ZIP", async () => {
    render(<PlannerPage />);
    await screen.findByRole("rowheader", { name: "02301" });

    fireEvent.click(within(row("02301")).getByRole("button", { name: "02301" }));

    await waitFor(() =>
      expect(screen.getByTestId("map-stub")).toHaveAttribute("data-selected-zip", "02301"),
    );
    expect(row("02301")).toHaveAttribute("aria-current", "true");
  });

  it("passes the same 0–100 scores to the map as the list shows", async () => {
    render(<PlannerPage />);
    await screen.findByRole("rowheader", { name: "02360" });
    await waitFor(() => expect(mapProps.current?.scores).toBeDefined());

    const scores = mapProps.current!.scores as Map<string, { score100: number }>;
    const listScore = within(row("02360")).getByText(
      (_, el) => el?.classList.contains("shrink-0") === true,
    ).textContent;
    expect(String(scores.get("02360")?.score100)).toBe(listScore);
  });

  it("the Weather alerts toggle removes alerts from the map and the ranking", async () => {
    render(<PlannerPage />);
    await screen.findByRole("rowheader", { name: "02360" });
    await waitFor(() =>
      expect(within(row("02360")).getByText(/severity severe/i)).toBeInTheDocument(),
    );
    expect(mapProps.current?.countySeverity).toBeInstanceOf(Map);

    fireEvent.click(screen.getByRole("checkbox", { name: /weather alerts/i }));

    await waitFor(() =>
      expect(within(row("02360")).queryByText(/severity severe/i)).not.toBeInTheDocument(),
    );
    expect(mapProps.current?.countySeverity).toBeUndefined();
  });

  it("Storm Replay frames drive the ranked list and the map (Simulated)", async () => {
    render(<PlannerPage />);
    await screen.findByRole("rowheader", { name: "02139" });

    fireEvent.click(screen.getByRole("checkbox", { name: /show storm replay/i }));
    expect(await screen.findByRole("heading", { name: /storm replay \(simulated\)/i })).toBeInTheDocument();

    // Hour 0: no simulated outages, so Middlesex's 02139 has no outage chip.
    expect(within(row("02139")).queryByText(/active outage bonus/i)).not.toBeInTheDocument();

    // Hour 7 of the replay file: Middlesex (25017) is in simulated outage.
    fireEvent.change(screen.getByLabelText(/simulated hour/i), { target: { value: "7" } });
    await waitFor(() =>
      expect(within(row("02139")).getByText(/active outage bonus/i)).toBeInTheDocument(),
    );
    await waitFor(() => {
      const countyOutage = mapProps.current?.countyOutage as Map<string, string> | undefined;
      expect(countyOutage?.get("25017")).toBe("outage");
      expect(mapProps.current?.outagesSimulated).toBe(true);
    });
  });

  it("shows layer toggles for all three layers", async () => {
    render(<PlannerPage />);
    await screen.findByRole("rowheader", { name: "02360" });
    expect(screen.getByRole("checkbox", { name: /power dependent residents/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /weather alerts/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /^outages/i })).toBeChecked();
  });
});
