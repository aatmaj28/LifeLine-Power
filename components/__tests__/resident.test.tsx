import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import LanguagePicker from "@/components/LanguagePicker";
import OutagePlanCard from "@/components/OutagePlanCard";
import { resolveCopy } from "@/lib/app/copy/resolve";
import { batteryTimeline, makeSmallCount } from "@/lib/risk-engine";
import type { Timeline } from "@/lib/risk-engine";
import type { ResidentPlan } from "@/lib/app/plan-storage";

/**
 * Unit tests for the resident components (LanguagePicker and OutagePlanCard).
 *
 * Requirements:
 *   5.2 — resident chooses from the six supported languages.
 *   5.3 / 5.4 — card is complete and localized; controls have accessible names.
 *   6.1 — battery timeline is always labeled "based on what you entered".
 *   9.4 — masked/aggregated counts are shown via their honest label
 *         ("11 or fewer"), never a raw number.
 *
 * These assert on visible text and accessible names, never color, and verify
 * the card renders only our calm plain-language copy (no medical or
 * evacuation-timing advice).
 */

describe("LanguagePicker", () => {
  it("renders all six language options with their autonym labels", () => {
    render(<LanguagePicker value="en" onChange={() => {}} />);

    const expectedLabels = [
      "English",
      "Español",
      "Português",
      "Kreyòl Ayisyen",
      "简体中文",
      "Tiếng Việt",
    ];

    for (const label of expectedLabels) {
      expect(
        screen.getByRole("option", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("exposes the control through its visible label (accessible name)", () => {
    render(
      <LanguagePicker value="en" onChange={() => {}} label="Language" />,
    );

    // The <select> is reachable by its associated <label> text.
    const select = screen.getByLabelText("Language");
    expect(select).toBeInTheDocument();
    expect(select.tagName).toBe("SELECT");
  });

  it("calls onChange with the newly selected language code", () => {
    const onChange = vi.fn();
    render(
      <LanguagePicker value="en" onChange={onChange} label="Language" />,
    );

    const select = screen.getByLabelText("Language");
    fireEvent.change(select, { target: { value: "es" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("es");
  });
});

describe("OutagePlanCard", () => {
  // A fixed outage start so the formatted timeline is deterministic.
  // 2026-10-15T22:00:00.000Z is 6 PM US-Eastern-friendly local clock in the
  // formatter's en-US output; the exact clock time is not asserted here.
  const OUTAGE_START = 1_760_565_600_000;

  function buildPlan(overrides: Partial<ResidentPlan> = {}): ResidentPlan {
    return {
      zip: "02118",
      deviceTypes: ["Oxygen concentrator", "Powered wheelchair"],
      batteryHours: 4,
      contacts: [{ name: "Jordan Rivera", phone: "555-0100" }],
      language: "en",
      ...overrides,
    };
  }

  function buildTimeline(hours: number): Timeline {
    const result = batteryTimeline(hours, OUTAGE_START);
    if (!result.ok) {
      throw new Error("expected a valid timeline for a non-negative duration");
    }
    return result.value;
  }

  it("renders a complete card: devices, contacts, timeline label, safety lines, and steps", () => {
    const plan = buildPlan();
    const copy = resolveCopy("en");
    const timeline = buildTimeline(4);

    render(<OutagePlanCard plan={plan} copy={copy} timeline={timeline} />);

    // Device types are shown.
    expect(screen.getByText("Oxygen concentrator")).toBeInTheDocument();
    expect(screen.getByText("Powered wheelchair")).toBeInTheDocument();

    // Contact name and phone are shown.
    expect(screen.getByText("Jordan Rivera")).toBeInTheDocument();
    expect(screen.getByText(/555-0100/)).toBeInTheDocument();

    // The battery timeline carries the fixed based-on-input label.
    expect(
      screen.getByText(/based on what you entered/i),
    ).toBeInTheDocument();

    // Both fixed safety lines are present.
    expect(screen.getByText(copy.safetyLine1)).toBeInTheDocument();
    expect(screen.getByText(copy.safetyLine2)).toBeInTheDocument();

    // Section headings for steps-before-storm and devices are present.
    expect(
      screen.getByRole("heading", {
        name: copy.catalog["card.stepsBeforeStorm.heading"],
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: copy.catalog["card.devices.heading"],
      }),
    ).toBeInTheDocument();
  });

  it("renders a masked count via its honest label, never a raw number (Req 9.4)", () => {
    const plan = buildPlan();
    const copy = resolveCopy("en");

    render(
      <OutagePlanCard
        plan={plan}
        copy={copy}
        smallCount={makeSmallCount(11)}
      />,
    );

    expect(screen.getByText("11 or fewer")).toBeInTheDocument();
  });

  it("renders only our copy — no medical or evacuation-timing advice", () => {
    const plan = buildPlan();
    const copy = resolveCopy("en");
    const timeline = buildTimeline(4);

    const { container } = render(
      <OutagePlanCard plan={plan} copy={copy} timeline={timeline} />,
    );

    const text = container.textContent ?? "";

    // Light honesty check: the card must not tell someone when to evacuate or
    // give medical direction. It renders only calm plain-language copy.
    expect(text).not.toMatch(/evacuat/i);
    expect(text).not.toMatch(/take your medication/i);
    expect(text).not.toMatch(/you should leave/i);
  });
});
