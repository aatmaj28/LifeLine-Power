import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";

import PlanPage from "@/app/plan/page";
import { resolveCopy } from "@/lib/app/copy/resolve";

/**
 * Unit/integration tests for the resident page (`app/plan/page.tsx`).
 *
 * Requirements:
 *   4.2 — up to three emergency contacts; the add control is capped at 3.
 *   4.6 — battery hours validate `>= 0`; negative input shows an inline prompt.
 *   5.1 — live storm alerts render for a valid ZIP, with a data-source badge.
 *   5.7 — share prefers the native `navigator.share` sheet when present.
 *   5.8 — with no native share, fall back to copy-to-clipboard; print is shown.
 *   6.9 — with no AI key (`/api/translate` unhappy), the page still renders the
 *         complete English copy and never throws.
 *
 * The page fetches `/api/translate` on mount and `/api/alerts` once a valid ZIP
 * is present. We stub `global.fetch` to route by URL so each test controls both
 * responses. Resident data lives only in localStorage, which we clear between
 * tests. All globals are unstubbed afterwards.
 */

// English copy the page renders when no translation overlay arrives.
const EN = resolveCopy("en");

/** A single live NWS alert, as the `/api/alerts` envelope would return it. */
const SAMPLE_ALERT = {
  id: "urn:oid:test.alert.1",
  severity: "Severe",
  headline: "Winter Storm Warning for Eastern Massachusetts",
};

/**
 * Build a `fetch` stub that routes by URL.
 *
 * @param opts.translateOk  when false, `/api/translate` resolves `{ ok: false }`
 *                          (the no-AI-key fallback path: the page keeps its
 *                          client-resolved English copy).
 * @param opts.translateReject when true, `/api/translate` rejects entirely.
 */
function makeFetchStub(
  opts: { translateOk?: boolean; translateReject?: boolean } = {},
) {
  const { translateOk = true, translateReject = false } = opts;

  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/api/translate")) {
      if (translateReject) {
        return Promise.reject(new Error("no network"));
      }
      if (!translateOk) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: false }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ ok: true, copy: resolveCopy("en") }),
      } as Response);
    }

    if (url.includes("/api/alerts")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            value: [SAMPLE_ALERT],
            source: "nws-live-alert",
            updatedAt: new Date("2026-10-15T18:00:00.000Z").toISOString(),
          }),
      } as Response);
    }

    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

/** Type "02139" into the ZIP input to trigger the alerts fetch. */
function typeValidZip() {
  const zip = screen.getByLabelText(EN.catalog["form.zip.label"]);
  fireEvent.change(zip, { target: { value: "02139" } });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlanPage — no AI key renders English", () => {
  it("renders the English title and intro when /api/translate returns { ok: false }", async () => {
    vi.stubGlobal("fetch", makeFetchStub({ translateOk: false }));

    render(<PlanPage />);

    // Title + intro come from the client resolver (English templates).
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: EN.catalog["page.title"],
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(EN.catalog["page.intro"])).toBeInTheDocument();

    // Let the translate effect settle; the page must stay on English copy.
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: EN.catalog["page.title"] }),
      ).toBeInTheDocument();
    });
  });

  it("stays on English and does not throw when /api/translate rejects", async () => {
    vi.stubGlobal("fetch", makeFetchStub({ translateReject: true }));

    render(<PlanPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: EN.catalog["page.title"] }),
    ).toBeInTheDocument();

    // The Share and Print buttons use English labels too.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: EN.catalog["action.share"] }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: EN.catalog["action.print"] }),
    ).toBeInTheDocument();
  });
});

describe("PlanPage — battery hours validation (Req 4.6)", () => {
  it("shows an inline prompt for a negative value and clears it for a valid one", async () => {
    vi.stubGlobal("fetch", makeFetchStub());

    render(<PlanPage />);
    // Let the on-mount translate effect settle before interacting.
    await screen.findByRole("button", { name: EN.catalog["action.share"] });

    const battery = screen.getByLabelText(
      EN.catalog["form.batteryHours.label"],
    );

    // Negative input: the inline alert appears telling the user to use 0+.
    fireEvent.change(battery, { target: { value: "-2" } });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/use 0 or more/i);

    // A valid value removes the prompt.
    fireEvent.change(battery, { target: { value: "4" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("PlanPage — max 3 contacts (Req 4.2)", () => {
  it("disables the add button and shows the limit note once 3 contacts exist", async () => {
    vi.stubGlobal("fetch", makeFetchStub());

    render(<PlanPage />);
    await screen.findByRole("button", { name: EN.catalog["action.share"] });

    const addButton = () =>
      screen.getByRole("button", {
        name: EN.catalog["form.addContact.label"],
      });

    expect(addButton()).toBeEnabled();

    // Add up to the cap of three.
    fireEvent.click(addButton());
    fireEvent.click(addButton());
    fireEvent.click(addButton());

    // There are exactly three contact-name inputs.
    expect(screen.getAllByLabelText(EN.catalog["form.contactName.label"])).toHaveLength(3);

    // The add control is now disabled and the limit note is shown.
    expect(addButton()).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/up to 3 contacts/i);

    // Clicking the disabled button cannot add a 4th contact.
    fireEvent.click(addButton());
    expect(screen.getAllByLabelText(EN.catalog["form.contactName.label"])).toHaveLength(3);
  });
});

describe("PlanPage — alerts for ZIP (Req 5.1)", () => {
  it("prompts for a ZIP when none is entered", async () => {
    vi.stubGlobal("fetch", makeFetchStub());

    render(<PlanPage />);
    await screen.findByRole("button", { name: EN.catalog["action.share"] });

    expect(
      screen.getByText(/enter your zip code to see active storm alerts/i),
    ).toBeInTheDocument();
  });

  it("renders the alert headline, severity, and data-source badge for a valid ZIP", async () => {
    vi.stubGlobal("fetch", makeFetchStub());

    render(<PlanPage />);
    typeValidZip();

    // The alert content arrives from the stubbed /api/alerts envelope.
    expect(await screen.findByText(SAMPLE_ALERT.headline)).toBeInTheDocument();
    expect(screen.getByText(/severity:\s*severe/i)).toBeInTheDocument();

    // The honest data-source badge labels the live NWS source.
    expect(
      screen.getByText("National Weather Service (live)"),
    ).toBeInTheDocument();

    // The "enter your ZIP" prompt is gone once alerts load.
    expect(
      screen.queryByText(/enter your zip code to see active storm alerts/i),
    ).not.toBeInTheDocument();
  });
});

describe("PlanPage — share branches (Req 5.7, 5.8)", () => {
  it("uses the native share sheet when navigator.share is present", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      share,
    });

    render(<PlanPage />);

    fireEvent.click(
      screen.getByRole("button", { name: EN.catalog["action.share"] }),
    );

    await waitFor(() => {
      expect(share).toHaveBeenCalledTimes(1);
    });
    const arg = share.mock.calls[0][0];
    expect(typeof arg.text).toBe("string");
    expect(arg.text.length).toBeGreaterThan(0);
  });

  it("falls back to clipboard and shows a copied note when share is unavailable; print exists", async () => {
    vi.stubGlobal("fetch", makeFetchStub());
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      share: undefined,
      clipboard: { writeText },
    });

    render(<PlanPage />);

    // A Print button is present alongside Share.
    expect(
      screen.getByRole("button", { name: EN.catalog["action.print"] }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: EN.catalog["action.share"] }),
    );

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(typeof writeText.mock.calls[0][0]).toBe("string");

    // The page shows a "copied" status note.
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });
});
