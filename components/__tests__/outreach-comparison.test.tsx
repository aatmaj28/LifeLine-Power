import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import OutreachComparison from "@/components/OutreachComparison";
import type { ReplayFrame, ZipLite } from "@/lib/app/replay/replay";

/**
 * The simulated Outreach comparison panel: labeled Simulated, N selectable, and
 * a sentence that states only what the numbers show.
 */

// 30 ZIPs: 5 in the outage county (25001) with residents, 25 elsewhere.
const ZIPS: ZipLite[] = Array.from({ length: 30 }, (_, i) => ({
  zip: String(1000 + i).padStart(5, "0"),
  countyFips: i < 5 ? "25001" : "25017",
  powerDependentDme: { value: i < 5 ? 100 : 50, masked: false },
}));
const FRAME: ReplayFrame = { hour: 3, label: "", counties: [{ fips: "25001", status: "outage" }] };
const AFFECTED_FIRST = ZIPS.map((z) => z.zip); // the 5 affected ZIPs come first
const AFFECTED_LAST = [...AFFECTED_FIRST].reverse(); // the 5 affected ZIPs come last

describe("OutreachComparison", () => {
  it("is labeled Simulated and shows three bars with percentages", () => {
    render(<OutreachComparison frame={FRAME} zips={ZIPS} priorityOrder={AFFECTED_FIRST} />);
    expect(screen.getByRole("heading", { name: /outreach comparison \(simulated\)/i })).toBeInTheDocument();
    expect(screen.getByText("Simulated")).toBeInTheDocument();
    expect(screen.getByText("PowerPlan priority order")).toBeInTheDocument();
    expect(screen.getByText(/random order \(average of 500 shuffles\)/i)).toBeInTheDocument();
    expect(screen.getByText("Alphabetical by ZIP")).toBeInTheDocument();
  });

  it("says PowerPlan reaches more only when it does", () => {
    render(<OutreachComparison frame={FRAME} zips={ZIPS} priorityOrder={AFFECTED_FIRST} />);
    // Default N = 20 reaches all 5 affected ZIPs in PowerPlan order.
    expect(
      screen.getByText(/calling the top 20 zips in powerplan order reaches 100% of affected residents, vs \d+% in random order\./i),
    ).toBeInTheDocument();
  });

  it("does not claim an advantage when PowerPlan order reaches fewer", () => {
    render(<OutreachComparison frame={FRAME} zips={ZIPS} priorityOrder={AFFECTED_LAST} />);
    fireEvent.click(screen.getByRole("radio", { name: /top 10/i }));
    const sentence = screen.getByText(/calling the top 10 zips in powerplan order reaches 0%/i);
    expect(sentence).toHaveTextContent(/less than the \d+% reached in random order this hour/i);
    expect(sentence.textContent).not.toMatch(/, vs /);
  });

  it("lets the planner choose N = 10, 20, or 50", () => {
    render(<OutreachComparison frame={FRAME} zips={ZIPS} priorityOrder={AFFECTED_FIRST} />);
    for (const n of [10, 20, 50]) {
      fireEvent.click(screen.getByRole("radio", { name: new RegExp(`top ${n}`, "i") }));
      expect(screen.getByRole("radio", { name: new RegExp(`top ${n}`, "i") })).toBeChecked();
      expect(screen.getByText(new RegExp(`calling the top ${n} zips`, "i"))).toBeInTheDocument();
    }
  });

  it("says there is nothing to compare when no ZIP is in a simulated outage area", () => {
    render(
      <OutreachComparison frame={{ hour: 0, label: "", counties: [] }} zips={ZIPS} priorityOrder={AFFECTED_FIRST} />,
    );
    expect(screen.getByText(/no zip codes are in simulated outage areas this hour/i)).toBeInTheDocument();
    expect(screen.queryByText("PowerPlan priority order")).not.toBeInTheDocument();
  });
});
