import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";

import FridgeCard, { QR_TRUST_NOTE } from "@/components/FridgeCard";
import PlanPage from "@/app/plan/page";
import { resolveCopy } from "@/lib/app/copy/resolve";
import { encodePlanHash } from "@/lib/app/plan-hash";
import type { ResidentPlan } from "@/lib/app/plan-storage";
import { batteryTimeline } from "@/lib/risk-engine/battery";

/**
 * Fridge card and QR restore (wow-features Requirements 6.1-6.6).
 */

const PLAN: ResidentPlan = {
  zip: "02360",
  deviceTypes: ["Oxygen concentrator", "Powered wheelchair"],
  batteryHours: 6,
  contacts: [{ name: "Nguyễn Thị Lan", phone: "555-0123" }],
  language: "en",
};

describe("FridgeCard", () => {
  it("shows devices, battery bar, contacts, help numbers, safety lines, QR, and the trust note", () => {
    const copy = resolveCopy("en");
    const t = batteryTimeline(6, Date.UTC(2026, 9, 24, 22, 0));
    if (!t.ok) throw new Error("timeline");
    render(
      <FridgeCard
        plan={PLAN}
        copy={copy}
        timeline={t.value}
        timelineText="Your battery covers about 6 hours. based on what you entered"
        qrDataUrl="data:image/png;base64,iVBORw0KGgo="
      />,
    );
    const card = screen.getByRole("article", { name: /fridge card/i });
    const c = within(card);
    expect(c.getByText("Oxygen concentrator")).toBeInTheDocument();
    expect(c.getByText("Nguyễn Thị Lan")).toBeInTheDocument();
    expect(c.getByText(/battery runs out/i)).toBeInTheDocument();
    expect(c.getByText(/based on what you entered/i)).toBeInTheDocument();
    expect(c.getByText(/dial 211/i)).toBeInTheDocument();
    expect(c.getByText(copy.safetyLine1)).toBeInTheDocument();
    expect(c.getByText(copy.safetyLine2)).toBeInTheDocument();
    expect(c.getByRole("img", { name: /qr code/i })).toBeInTheDocument();
    expect(c.getByText(QR_TRUST_NOTE)).toBeInTheDocument();
  });
});

describe("/plan restores a plan from a fridge-card link", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ ok: false }) }) as unknown as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("loads the plan from #plan=..., saves it locally, and clears the hash", async () => {
    window.history.replaceState(null, "", `/plan#${encodePlanHash(PLAN)}`);
    render(<PlanPage />);

    expect(await screen.findByText(/loaded from a fridge card code/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("02360")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Nguyễn Thị Lan")).toBeInTheDocument();
    expect(screen.getByLabelText(/backup battery hours/i)).toHaveValue(6);
    expect(window.location.hash).toBe("");
    await waitFor(() =>
      expect(localStorage.getItem("powerplan.residentPlan")).toContain("02360"),
    );
    // The page shows the trust note next to the on-screen QR code.
    expect(screen.getAllByText(QR_TRUST_NOTE).length).toBeGreaterThan(0);
  });

  it("ignores a damaged code and keeps the saved plan", async () => {
    localStorage.setItem(
      "powerplan.residentPlan",
      JSON.stringify({ ...PLAN, zip: "01001", contacts: [] }),
    );
    window.history.replaceState(null, "", "/plan#plan=%%%not-a-plan");
    render(<PlanPage />);

    expect(await screen.findByText(/could not be read/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByDisplayValue("01001")).toBeInTheDocument());
  });
});
