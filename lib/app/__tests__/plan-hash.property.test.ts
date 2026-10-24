import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { decodePlanHash, encodePlanHash, planLink } from "../plan-hash";
import type { ResidentPlan, SupportedLanguage } from "../plan-storage";

/**
 * Feature: wow-features, Property 6: Plan hash round-trips and never throws.
 * Validates: Requirements 6.3, 6.4, 6.5.
 */

const LANGS: SupportedLanguage[] = ["en", "es", "pt", "ht", "zh-Hans", "vi"];

// fc.string() includes full Unicode (accents, CJK, emoji), which matters for
// names like "Nguyễn" or "王" in contacts.
const planArb: fc.Arbitrary<ResidentPlan> = fc.record({
  zip: fc.integer({ min: 0, max: 99999 }).map((n) => String(n).padStart(5, "0")),
  deviceTypes: fc.array(fc.string({ unit: "grapheme", maxLength: 30 }), { maxLength: 5 }),
  batteryHours: fc.double({ min: 0, max: 10_000, noNaN: true, noDefaultInfinity: true }),
  contacts: fc.array(
    fc.record({
      name: fc.string({ unit: "grapheme", maxLength: 30 }),
      phone: fc.string({ maxLength: 20 }),
    }),
    { maxLength: 3 },
  ),
  language: fc.constantFrom(...LANGS),
});

describe("Feature: wow-features, Property 6: Plan hash round-trips and never throws", () => {
  it("decode(encode(plan)) deep-equals the plan, with or without a leading #", () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const hash = encodePlanHash(plan);
        expect(decodePlanHash(hash)).toEqual(plan);
        expect(decodePlanHash(`#${hash}`)).toEqual(plan);
      }),
      { numRuns: 300 },
    );
  });

  it("the encoded hash is URL-safe (no characters that need escaping)", () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        expect(encodePlanHash(plan)).toMatch(/^plan=[A-Za-z0-9_-]*$/);
      }),
      { numRuns: 200 },
    );
  });

  it("never throws on arbitrary input and returns null for junk", () => {
    fc.assert(
      fc.property(fc.string(), (junk) => {
        expect(() => decodePlanHash(junk)).not.toThrow();
        expect(() => decodePlanHash(`#plan=${junk}`)).not.toThrow();
      }),
      { numRuns: 300 },
    );
    expect(decodePlanHash("")).toBeNull();
    expect(decodePlanHash("#plan=")).toBeNull();
    expect(decodePlanHash("#plan=not*base64")).toBeNull();
    expect(decodePlanHash("#other=abc")).toBeNull();
  });

  it("rejects a well-formed hash whose JSON is not a valid plan", () => {
    const bad = btoa(JSON.stringify({ zip: 2360 })).replace(/=+$/, "");
    expect(decodePlanHash(`#plan=${bad}`)).toBeNull();
  });

  it("planLink puts the plan only in the fragment", () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const url = new URL(planLink("https://example.org/", plan));
        expect(url.pathname).toBe("/plan");
        expect(url.search).toBe("");
        expect(decodePlanHash(url.hash)).toEqual(plan);
      }),
      { numRuns: 200 },
    );
  });
});
