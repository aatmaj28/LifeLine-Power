import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import DataSourceBadge from "@/components/DataSourceBadge";
import SimulatedBadge from "@/components/SimulatedBadge";
import SafetyLines from "@/components/SafetyLines";

/**
 * Unit tests for the labeling and safety components.
 *
 * Requirements: 8.4 (source + last-updated on every data view),
 * 9.1 / 9.2 (always-present safety lines), 9.5 (simulated clearly labeled).
 *
 * These assert on visible text, never color, so meaning is conveyed by text.
 */

describe("DataSourceBadge", () => {
  // A fixed timestamp so the "Last updated:" value is deterministic.
  const updatedAt = "2026-10-15T18:00:00.000Z";

  it("renders the friendly emPOWER source label with text labels for source and last-updated", () => {
    render(
      <DataSourceBadge
        source="empower-aggregated-deidentified-medicare"
        updatedAt={updatedAt}
      />,
    );

    // Friendly, honest label for the emPOWER code.
    expect(
      screen.getByText(
        "HHS emPOWER (aggregated, de-identified Medicare data)",
      ),
    ).toBeInTheDocument();

    // Meaning conveyed by text, not color.
    expect(screen.getByText("Data source:")).toBeInTheDocument();
    expect(screen.getByText("Last updated:")).toBeInTheDocument();
  });

  it("renders the friendly NWS source label", () => {
    render(<DataSourceBadge source="nws-live-alert" updatedAt={updatedAt} />);

    expect(
      screen.getByText("National Weather Service (live)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Data source:")).toBeInTheDocument();
    expect(screen.getByText("Last updated:")).toBeInTheDocument();
  });
});

describe("SimulatedBadge", () => {
  it("renders the visible text 'Simulated'", () => {
    render(<SimulatedBadge />);

    // Label is text-based, not color-only.
    expect(screen.getByText("Simulated")).toBeInTheDocument();
  });
});

describe("SafetyLines", () => {
  it("renders both safety lines exactly as passed (language-correct, not hardcoded)", () => {
    const safetyLine1 = "LINE_ONE_911";
    const safetyLine2 = "LINE_TWO_DOCTOR";

    render(
      <SafetyLines safetyLine1={safetyLine1} safetyLine2={safetyLine2} />,
    );

    // Both provided strings appear verbatim.
    expect(screen.getByText(safetyLine1)).toBeInTheDocument();
    expect(screen.getByText(safetyLine2)).toBeInTheDocument();
  });
});
