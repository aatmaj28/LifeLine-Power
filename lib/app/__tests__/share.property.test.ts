import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { buildShareText } from "../share";
import type {
  ResidentContact,
  ResidentPlan,
  SupportedLanguage,
} from "../plan-storage";

/**
 * Property 5: Share text never encodes resident data in a URL.
 *
 * For any `ResidentPlan`, `buildShareText(plan)` contains no URL whose query
 * string or fragment encodes the resident's contact names, contact phone
 * numbers, or device list.
 *
 * The implementation builds the share body from plain prose only and includes
 * no URL at all. The primary, strongest guarantee of Property 5 is therefore
 * that the output contains no `http://` or `https://` token: with no URL
 * present, no URL can possibly encode resident PII. As a defense-in-depth
 * check we also extract any URL-like tokens (there should be none) and assert
 * none of the generated, distinctive PII values appear in their query string
 * or fragment.
 *
 * Validates: Requirements 5.9
 */
describe("Feature: app, Property 5: Share text never encodes resident data in a URL", () => {
  const languageArb: fc.Arbitrary<SupportedLanguage> = fc.constantFrom(
    "en",
    "es",
    "pt",
    "ht",
    "zh-Hans",
    "vi",
  );

  const zipArb: fc.Arbitrary<string> = fc
    .integer({ min: 0, max: 99999 })
    .map((n) => String(n).padStart(5, "0"));

  // Non-trivial device strings: non-empty, distinctive tokens so a leak would
  // be obvious. Prefix keeps them from colliding with ordinary prose.
  const deviceTypeArb: fc.Arbitrary<string> = fc
    .string({ minLength: 1, maxLength: 20 })
    .map((s) => `DEV_${s.replace(/\s/g, "_")}X`);

  const deviceTypesArb: fc.Arbitrary<string[]> = fc.array(deviceTypeArb, {
    minLength: 0,
    maxLength: 5,
  });

  const batteryHoursArb: fc.Arbitrary<number> = fc.double({
    min: 0,
    max: 1_000_000,
    noNaN: true,
    noDefaultInfinity: true,
  });

  // Distinctive, non-empty contact names/phones so any URL encoding would be
  // easy to detect.
  const contactArb: fc.Arbitrary<ResidentContact> = fc.record({
    name: fc
      .string({ minLength: 1, maxLength: 20 })
      .map((s) => `NAME_${s.replace(/\s/g, "_")}X`),
    phone: fc
      .string({ minLength: 1, maxLength: 15 })
      .map((s) => `PHONE_${s.replace(/\s/g, "_")}X`),
  });

  const contactsArb: fc.Arbitrary<ResidentContact[]> = fc.array(contactArb, {
    minLength: 0,
    maxLength: 3,
  });

  const planArb: fc.Arbitrary<ResidentPlan> = fc.record({
    zip: zipArb,
    deviceTypes: deviceTypesArb,
    batteryHours: batteryHoursArb,
    contacts: contactsArb,
    language: languageArb,
  });

  // Matches any http:// or https:// token in the output.
  const URL_PATTERN = /https?:\/\/\S*/g;

  it("emits no URL at all, so no resident PII can be URL-encoded", () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const text = buildShareText(plan);

        // Primary guarantee: there is no URL in the output.
        expect(text).not.toMatch(/https?:\/\//);

        // Defense-in-depth: if any URL-like token ever appeared, assert its
        // query string and fragment carry none of the resident's PII.
        const urls = text.match(URL_PATTERN) ?? [];
        const pii = [
          ...plan.deviceTypes,
          ...plan.contacts.flatMap((c) => [c.name, c.phone]),
        ];
        for (const url of urls) {
          const hashIndex = url.indexOf("#");
          const fragment = hashIndex >= 0 ? url.slice(hashIndex) : "";
          const beforeFragment = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
          const queryIndex = beforeFragment.indexOf("?");
          const query =
            queryIndex >= 0 ? beforeFragment.slice(queryIndex) : "";
          const queryAndFragment = query + fragment;

          for (const value of pii) {
            expect(queryAndFragment).not.toContain(value);
            // Also guard against URL-encoded forms of the value.
            expect(queryAndFragment).not.toContain(
              encodeURIComponent(value),
            );
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
