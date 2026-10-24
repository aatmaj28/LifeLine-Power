import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  selectTranslation,
  type SupportedLanguage,
  type TranslateEnv,
  type TranslateProvider,
  type TranslateRequest,
} from "../providers";
import { CATALOG_KEYS, EN_CATALOG } from "../../copy/catalog";
import { FIXED_STRINGS, getFixedStrings } from "../../copy/fixed-strings";

/**
 * Property 9: Fixed strings are never sent to an AI provider.
 *
 * For any SupportedLanguage and any translate request, the request payload
 * passed to an AI provider contains neither of the Fixed_Safety_Lines nor the
 * Based_On_Input_Label; those values in the resolved output come from the fixed
 * per-language table.
 *
 * Validates: Requirements 6.7
 */
describe("Feature: app, Property 9: Fixed strings are never sent to an AI provider", () => {
  // The non-English languages a resident request may target. "en" short-circuits
  // the provider chain, so it is excluded — a provider only ever sees non-"en".
  const nonEnglishLanguages: SupportedLanguage[] = [
    "es",
    "pt",
    "ht",
    "zh-Hans",
    "vi",
  ];

  // Every fixed string for every language — the exact values that must never
  // appear in the provider payload.
  const ALL_FIXED_VALUES: string[] = (
    Object.keys(FIXED_STRINGS) as SupportedLanguage[]
  ).flatMap((lang) => {
    const f = FIXED_STRINGS[lang];
    return [f.safetyLine1, f.safetyLine2, f.basedOnInputLabel];
  });

  it("builds a provider request from the translatable catalog only, excluding every fixed string", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonEnglishLanguages),
        async (language) => {
          // Build the request exactly as the translate route would: the
          // translatable catalog, nothing else.
          const req: TranslateRequest = {
            language,
            keys: [...CATALOG_KEYS],
            englishByKey: { ...EN_CATALOG },
          };

          // A spy Bedrock provider that CAPTURES the request it receives and
          // returns some copy. awsConfigured=true so the chain reaches it.
          let captured: TranslateRequest | undefined;
          const spyBedrock: TranslateProvider = async (incoming) => {
            captured = incoming;
            // Return arbitrary provider copy keyed by the same keys.
            return Object.fromEntries(
              incoming.keys.map((k) => [k, `[${language}] ${incoming.englishByKey[k]}`]),
            );
          };

          const env: TranslateEnv = {
            awsConfigured: true,
            genericKeyConfigured: false,
          };

          const result = await selectTranslation(env, req, {
            bedrock: spyBedrock,
          });

          // The spy provider was actually reached and produced the copy.
          expect(result.provider).toBe("bedrock");

          // The provider received a request.
          expect(captured).toBeDefined();
          const payload = captured as TranslateRequest;

          const capturedKeys = payload.keys;
          const capturedValues = Object.values(payload.englishByKey);

          // Core assertion: no fixed string — for ANY language — appears as a
          // key or as an English value in the payload sent to the provider.
          for (const fixed of ALL_FIXED_VALUES) {
            expect(capturedKeys).not.toContain(fixed);
            expect(capturedValues).not.toContain(fixed);
          }

          // Additionally, each language's own fixed trio is absent explicitly.
          const own = getFixedStrings(language);
          for (const fixed of [
            own.safetyLine1,
            own.safetyLine2,
            own.basedOnInputLabel,
          ]) {
            expect(capturedKeys).not.toContain(fixed);
            expect(capturedValues).not.toContain(fixed);
          }

          // Sanity: the payload still carried the translatable catalog, so the
          // exclusion is meaningful rather than an empty request.
          expect(capturedKeys).toEqual([...CATALOG_KEYS]);
          expect(capturedValues.length).toBeGreaterThan(0);

          // And the resolved fixed lines still come from the fixed per-language
          // table — never from the provider output.
          expect(result.copy).not.toHaveProperty(own.safetyLine1);
          expect(own.safetyLine1.length).toBeGreaterThan(0);
          expect(own.safetyLine2.length).toBeGreaterThan(0);
          expect(own.basedOnInputLabel.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
