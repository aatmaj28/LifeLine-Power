import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import ReadAloud from "@/components/ReadAloud";
import { resolveCopy } from "@/lib/app/copy/resolve";
import type { ResidentPlan } from "@/lib/app/plan-storage";

/**
 * Read aloud (wow-features Requirements 5.1-5.6). speechSynthesis is mocked:
 * jsdom has none, and these tests must never reach a real voice or a network.
 */

class FakeUtterance {
  text: string;
  lang = "";
  voice: unknown = null;
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

function installSpeech(voices: Array<{ lang: string; name: string; default?: boolean }>) {
  const spoken: FakeUtterance[] = [];
  const synth = {
    speak: vi.fn((u: FakeUtterance) => spoken.push(u)),
    cancel: vi.fn(),
    getVoices: vi.fn(() => voices),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  return { synth, spoken };
}

function plan(language: ResidentPlan["language"]): ResidentPlan {
  return {
    zip: "02360",
    deviceTypes: ["Oxygen concentrator"],
    batteryHours: 4,
    contacts: [{ name: "Jordan Rivera", phone: "555-0100" }],
    language,
  };
}

function renderFor(language: ResidentPlan["language"]) {
  return render(
    <ReadAloud
      plan={plan(language)}
      copy={resolveCopy(language)}
      englishCopy={resolveCopy("en")}
      timelineText="Your battery covers about 4 hours. based on what you entered"
      englishTimelineText="Your battery covers about 4 hours. based on what you entered"
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReadAloud", () => {
  it("reads the plan in the selected language with a matching voice, ending with the safety lines", async () => {
    const { synth, spoken } = installSpeech([
      { lang: "en-US", name: "Samantha", default: true },
      { lang: "es-US", name: "Paulina" },
    ]);
    renderFor("es");

    fireEvent.click(screen.getByRole("button", { name: /read my plan aloud/i }));

    await waitFor(() => expect(synth.speak).toHaveBeenCalled());
    expect(spoken.every((u) => u.lang === "es-US")).toBe(true);
    expect((spoken[0].voice as { name: string }).name).toBe("Paulina");
    const es = resolveCopy("es");
    expect(spoken.at(-2)?.text).toBe(es.safetyLine1);
    expect(spoken.at(-1)?.text).toBe(es.safetyLine2);
    expect(screen.queryByText(/no .* voice is available/i)).not.toBeInTheDocument();
  });

  it("Stop cancels speech", async () => {
    const { synth } = installSpeech([{ lang: "en-US", name: "Samantha", default: true }]);
    renderFor("en");

    fireEvent.click(screen.getByRole("button", { name: /read my plan aloud/i }));
    const stop = screen.getByRole("button", { name: /stop/i });
    await waitFor(() => expect(stop).toBeEnabled());

    synth.cancel.mockClear();
    fireEvent.click(stop);
    expect(synth.cancel).toHaveBeenCalled();
    await waitFor(() => expect(stop).toBeDisabled());
  });

  it("falls back to English with a plain note when no voice exists for the language", async () => {
    const { spoken } = installSpeech([{ lang: "en-US", name: "Samantha", default: true }]);
    renderFor("ht");

    fireEvent.click(screen.getByRole("button", { name: /read my plan aloud/i }));

    expect(
      await screen.findByText(/no haitian creole voice is available on this device/i),
    ).toBeInTheDocument();
    expect(spoken.every((u) => u.lang === "en-US")).toBe(true);
    // The English plan is read, so words and voice match.
    expect(spoken.at(-1)?.text).toBe(resolveCopy("en").safetyLine2);
  });

  it("explains when the browser has no speech support", async () => {
    // jsdom has no speechSynthesis by default.
    renderFor("en");
    expect(await screen.findByText(/read aloud is not available in this browser/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /read my plan aloud/i })).not.toBeInTheDocument();
  });
});
