import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import RankedList from "@/components/RankedList";
import {
  type EmpowerDataset,
  type EmpowerZipRecord,
  makeSmallCount,
} from "@/lib/risk-engine";

/**
 * Unit tests for the planner's testable (non-map) data path: {@link RankedList}.
 *
 * Requirements: 7.3 (ranked outreach-priority list showing score + reasons),
 * 7.6 (county selection filters the ranked list to that county's ZIPs).
 *
 * CountyChoropleth is a Leaflet client component that needs window/DOM map
 * internals and cannot be unit-tested meaningfully, so coverage focuses on
 * RankedList. County selection is exercised here via RankedList's `countyFips`
 * prop — the same filter the choropleth drives on the planner page.
 */

/**
 * Build a minimal {@link EmpowerZipRecord}. `powerDependentDme` accepts either a
 * raw number (wrapped via `makeSmallCount`) or a prebuilt `SmallCount` so a test
 * can pass `makeSmallCount(11)` to exercise the masked "11 or fewer" label.
 */
function makeZip(
  zip: string,
  county: string,
  countyFips: string,
  dme: number | EmpowerZipRecord["powerDependentDme"],
): EmpowerZipRecord {
  return {
    zip,
    county,
    countyFips,
    medicareBenes: 1000,
    powerDependentDme: typeof dme === "number" ? makeSmallCount(dme) : dme,
    esrdDialysisAnyDme: 0,
    o2ServicesAnyDme: 0,
    homeHealthAnyDme: 0,
    hospiceAnyDme: 0,
    healthcareSrvcAnyDme: 0,
    pctPowerDependent: 0,
    dataSource: "empower-aggregated-deidentified-medicare",
  };
}

// Two counties: Middlesex (25017) and Plymouth (25023). No alerts or outages,
// so each score reduces to the normalized dependent contribution — which makes
// the row order a direct function of the dependent counts below.
const MIDDLESEX = "25017";
const PLYMOUTH = "25023";

function makeDataset(): EmpowerDataset {
  const zip: EmpowerZipRecord[] = [
    makeZip("02138", "Middlesex", MIDDLESEX, 444), // highest
    makeZip("02139", "Middlesex", MIDDLESEX, 100), // lowest non-masked
    makeZip("02360", "Plymouth", PLYMOUTH, 200),
    makeZip("02542", "Plymouth", PLYMOUTH, makeSmallCount(11)), // masked
  ];

  return {
    zip,
    county: [],
    monthly: [],
    zipByCode: new Map(zip.map((record) => [record.zip, record])),
    zipsByCountyFips: new Map(),
  };
}

describe("RankedList", () => {
  it("renders a ranked row with a numeric score and dependents reason", () => {
    render(<RankedList dataset={makeDataset()} />);

    // Every dataset ZIP renders as a row header.
    for (const zip of ["02138", "02139", "02360", "02542"]) {
      expect(screen.getByRole("rowheader", { name: zip })).toBeInTheDocument();
    }

    // The highest-dependent ZIP's row shows a numeric score and a reason that
    // names the dependents signal via the "power-dependent" label substring.
    const topRow = screen.getByRole("rowheader", { name: "02138" }).closest("tr")!;
    const topCells = within(topRow);
    expect(topCells.getByText("1.00")).toBeInTheDocument(); // 444/444 = 1.00
    expect(
      topCells.getByText(/power-dependent/i),
    ).toBeInTheDocument();
  });

  it("ranks a higher-dependent ZIP at or above a lower-dependent ZIP", () => {
    render(<RankedList dataset={makeDataset()} />);

    // Body rows in render order. Rank 1 is the first body row.
    const rowHeaders = screen.getAllByRole("rowheader");
    const orderedZips = rowHeaders.map((cell) => cell.textContent?.trim());

    // 444 > 200 > 100 > 11, and no alerts/outages, so order is strictly by dme.
    expect(orderedZips).toEqual(["02138", "02360", "02139", "02542"]);

    // Higher-dependent ZIP (02138) ranks above a lower one (02139).
    expect(orderedZips.indexOf("02138")).toBeLessThan(
      orderedZips.indexOf("02139"),
    );
  });

  it("filters the ranked list to only the selected county's ZIPs", () => {
    render(<RankedList dataset={makeDataset()} countyFips={PLYMOUTH} />);

    // Plymouth ZIPs are present.
    expect(screen.getByRole("rowheader", { name: "02360" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "02542" })).toBeInTheDocument();

    // Middlesex ZIPs are absent.
    expect(
      screen.queryByRole("rowheader", { name: "02138" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("rowheader", { name: "02139" }),
    ).not.toBeInTheDocument();
  });

  it("shows the masked '11 or fewer' label for a small-count ZIP", () => {
    render(<RankedList dataset={makeDataset()} />);

    const maskedRow = screen.getByRole("rowheader", { name: "02542" }).closest("tr")!;
    expect(within(maskedRow).getByText("11 or fewer")).toBeInTheDocument();
  });
});
