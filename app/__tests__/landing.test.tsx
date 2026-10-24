import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import Home from "@/app/page";

describe("Landing page", () => {
  it("renders the PowerPlan heading", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: /powerplan/i }),
    ).toBeInTheDocument();
  });

  it("describes who PowerPlan is for", () => {
    render(<Home />);

    // The page should explain its audience: people who rely on powered
    // medical equipment such as oxygen concentrators, dialysis, ventilators,
    // or powered wheelchairs.
    expect(
      screen.getAllByText(
        /oxygen|dialysis|ventilator|powered wheelchair|electricity/i,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("provides a control that navigates to the resident page (/plan)", () => {
    render(<Home />);

    const residentLink = screen.getByRole("link", {
      name: /make my storm plan/i,
    });
    expect(residentLink.getAttribute("href")).toBe("/plan");
  });

  it("provides a control that navigates to the planner page (/planner)", () => {
    render(<Home />);

    const plannerLink = screen.getByRole("link", {
      name: /planner dashboard/i,
    });
    expect(plannerLink.getAttribute("href")).toBe("/planner");
  });
});
