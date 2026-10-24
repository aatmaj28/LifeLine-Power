import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import StormReplay, { PLAY_INTERVAL_MS } from "@/components/StormReplay";
import type { ReplayFile, ZipLite } from "@/lib/app/replay/replay";

/**
 * Component tests for the simulated Storm Replay controls (wow-features
 * Requirements 4.2-4.5, 4.7, 4.8).
 */

const FILE: ReplayFile = {
  simulated: true,
  description: "Simulated test storm",
  updatedAt: "2026-10-24T15:30:00.000Z",
  hours: 2,
  frames: [
    { hour: 0, label: "No outages yet.", counties: [] },
    { hour: 1, label: "Cape outages.", counties: [{ fips: "25001", status: "outage" }] },
    {
      hour: 2,
      label: "Cape restoring, Plymouth out.",
      counties: [
        { fips: "25001", status: "restoring" },
        { fips: "25023", status: "outage" },
      ],
    },
  ],
};

const ZIPS: ZipLite[] = [
  { zip: "02536", countyFips: "25001", powerDependentDme: { value: 149, masked: false } },
  { zip: "02542", countyFips: "25001", powerDependentDme: { value: 11, masked: true } },
  { zip: "02360", countyFips: "25023", powerDependentDme: { value: 444, masked: false } },
];

function Harness() {
  const [hour, setHour] = useState(0);
  return <StormReplay file={FILE} zips={ZIPS} hour={hour} onHourChange={setHour} />;
}

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })),
  );
}

beforeEach(() => setReducedMotion(false));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("StormReplay", () => {
  it("is clearly labeled Simulated", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { name: /storm replay \(simulated\)/i })).toBeInTheDocument();
    expect(screen.getByText(/not a forecast and not real outage data/i)).toBeInTheDocument();
    expect(screen.getByText("Data source:")).toBeInTheDocument();
  });

  it("does not autoplay", () => {
    vi.useFakeTimers();
    render(<Harness />);
    act(() => {
      vi.advanceTimersByTime(PLAY_INTERVAL_MS * 5);
    });
    expect(screen.getByText(/simulated hour 0 of 2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  it("steps forward and back, and the counter sums affected ZIPs only", () => {
    render(<Harness />);
    expect(screen.getByText("About 0")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /step forward/i }));
    // Hour 1: Cape in outage -> 149 + 11 (masked counted as up to 11).
    expect(screen.getByText(/simulated hour 1 of 2/i)).toBeInTheDocument();
    expect(screen.getByText("About 160")).toBeInTheDocument();
    expect(screen.getByRole("tooltip")).toHaveTextContent(/11 or fewer/i);

    fireEvent.click(screen.getByRole("button", { name: /step forward/i }));
    // Hour 2: Cape is restoring (not counted), Plymouth in outage -> 444.
    expect(screen.getByText("About 444")).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /step forward/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /step back/i }));
    expect(screen.getByText("About 160")).toBeInTheDocument();
  });

  it("the slider jumps to an hour", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/simulated hour/i), { target: { value: "2" } });
    expect(screen.getByText(/simulated hour 2 of 2/i)).toBeInTheDocument();
  });

  it("play advances on a timer and pause stops it", () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    act(() => {
      vi.advanceTimersByTime(PLAY_INTERVAL_MS);
    });
    expect(screen.getByText(/simulated hour 1 of 2/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    act(() => {
      vi.advanceTimersByTime(PLAY_INTERVAL_MS * 3);
    });
    expect(screen.getByText(/simulated hour 1 of 2/i)).toBeInTheDocument();
  });

  it("with reduced motion, play steps exactly one frame and starts no timer", () => {
    setReducedMotion(true);
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    expect(screen.getByText(/simulated hour 1 of 2/i)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(PLAY_INTERVAL_MS * 5);
    });
    expect(screen.getByText(/simulated hour 1 of 2/i)).toBeInTheDocument();
    // Still a Play button (never switched to Pause).
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });
});
