import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { resolveCopy, type ResolvedCopy } from "../resolve";
import { getFixedStrings } from "../fixed-strings";
import { CATALOG_KEYS, type CopyKey } from "../catalog";
import type { SupportedLanguage } from "../../plan-storage";

/**
 * Property 6: Resolved resident copy always includes both fixed safety lines.
 *
 * For any `SupportedLanguage`, and regardless of whether AI copy is present,
 * the resolved resident copy includes both `Fixed_Safety_Lines` verbatim from
 * the fixed per-language table. Because the two safety lines and the
 * based-on-input label are not catalog keys, no `aiCopy` value — even one that
 * adversarially mimics a safety line — can override them.
 *
 * Validates: Requirements 5.4, 9.5
 */
describe("Feature: app, Property 6: Resolved resident copy always includes both fixed safety lines", () => {
  // The six supported resident languages.
  const language = fc.constantFrom<SupportedLanguage>(
    "en",
    "es",
    "pt",
    "ht",
    "zh-Hans",
    "vi",
  );

  // Adversarial strings: ordinary copy mixed with strings that try to mimic the
  // fixed safety lines / based-on-input label, so a successful override would
  // be caught.
  const copyValue = fc.oneof(
    fc.string(),
    fc.constantFrom(
      "If your device stops and you are in danger, call 911.",
      "Talk to your doctor or equipment supplier about your backup plan.",
      "based on what you entered",
      "call 911 now",
      "",
    ),
  );

  // An OPTIONAL partial record over the catalog keys -> arbitrary strings.
  const optionalAiCopy = fc.option(
    fc.dictionary(fc.constantFrom(...CATALOG_KEYS), copyValue) as fc.Arbitrary<
      Partial<Record<CopyKey, string>>
    >,
    { nil: undefined },
  );

  it("takes both safety lines and the based-on-input label verbatim from the fixed per-language table, regardless of aiCopy", () => {
    fc.assert(
      fc.property(language, optionalAiCopy, (lang, aiCopy) => {
        const resolved: ResolvedCopy = resolveCopy(lang, aiCopy);
        const fixed = getFixedStrings(lang);

        expect(resolved.safetyLine1).toBe(fixed.safetyLine1);
        expect(resolved.safetyLine2).toBe(fixed.safetyLine2);
        expect(resolved.basedOnInputLabel).toBe(fixed.basedOnInputLabel);
      }),
      { numRuns: 200 },
    );
  });
});
