import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { resolveCopy } from "../copy/resolve";
import { getFixedStrings } from "../copy/fixed-strings";
import type { ResidentPlan, SupportedLanguage } from "../plan-storage";
import { buildSpokenParts, buildSpokenPlan, pickVoice, SPEECH_LANG } from "../speech";

/**
 * Feature: wow-features, Property 7: Spoken plan always includes both safety lines.
 * Validates: Requirements 5.6. Plus example tests for voice selection (5.2, 5.3).
 */

const LANGS: SupportedLanguage[] = ["en", "es", "pt", "ht", "zh-Hans", "vi"];

const planArb: fc.Arbitrary<ResidentPlan> = fc.record({
  zip: fc.string({ maxLength: 5 }),
  deviceTypes: fc.array(fc.string({ maxLength: 30 }), { maxLength: 5 }),
  batteryHours: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
  contacts: fc.array(fc.record({ name: fc.string({ maxLength: 20 }), phone: fc.string({ maxLength: 15 }) }), {
    maxLength: 3,
  }),
  language: fc.constantFrom(...LANGS),
});

describe("Feature: wow-features, Property 7: Spoken plan always includes both safety lines", () => {
  it("contains both fixed safety lines, verbatim, as the last two parts", () => {
    fc.assert(
      fc.property(planArb, fc.option(fc.string(), { nil: null }), (plan, timelineText) => {
        const copy = resolveCopy(plan.language);
        const fixed = getFixedStrings(plan.language);
        const parts = buildSpokenParts(plan, copy, timelineText);
        expect(parts.at(-2)).toBe(fixed.safetyLine1);
        expect(parts.at(-1)).toBe(fixed.safetyLine2);
        const text = buildSpokenPlan(plan, copy, timelineText);
        expect(text).toContain(fixed.safetyLine1);
        expect(text).toContain(fixed.safetyLine2);
      }),
      { numRuns: 200 },
    );
  });

  it("never produces an empty utterance", () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        for (const part of buildSpokenParts(plan, resolveCopy(plan.language), null)) {
          expect(part.trim().length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("pickVoice", () => {
  const voices = [
    { lang: "en-US", name: "Samantha", default: true },
    { lang: "es-ES", name: "Monica" },
    { lang: "zh-TW", name: "Meijia" },
    { lang: "zh-CN", name: "Tingting" },
  ];

  it("matches the exact tag, then the same language", () => {
    expect(pickVoice(voices, "zh-Hans").voice?.name).toBe("Tingting");
    const es = pickVoice(voices, "es");
    expect(es.voice?.name).toBe("Monica");
    expect(es.fellBack).toBe(false);
    expect(es.lang).toBe(SPEECH_LANG.es);
  });

  it("falls back to English and says so when no voice matches", () => {
    const ht = pickVoice(voices, "ht");
    expect(ht.fellBack).toBe(true);
    expect(ht.voice?.name).toBe("Samantha");
    expect(ht.lang).toBe("en-US");
  });

  it("never throws and falls back for any language with no voices", () => {
    for (const lang of LANGS) {
      const choice = pickVoice([], lang);
      expect(choice.voice).toBeNull();
      expect(choice.fellBack).toBe(lang !== "en");
    }
  });
});
