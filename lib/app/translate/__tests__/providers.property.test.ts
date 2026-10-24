import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  selectTranslation,
  type SupportedLanguage,
  type TranslateEnv,
  type TranslateProvider,
  type TranslateRequest,
  type TranslateDeps,
} from "../providers";

/**
 * Property 8: Translation provider chain resolves deterministically and never
 * throws.
 *
 * For any environment (awsConfigured?, genericKeyConfigured?) and any provider
 * outcomes (each configured provider succeeds or throws), `selectTranslation`
 * resolves by the chain Bedrock → generic → English templates:
 *   - `language === "en"` short-circuits to the English template copy.
 *   - otherwise Bedrock wins when AWS is configured, the dep is present, and it
 *     succeeds;
 *   - otherwise the generic provider wins when its key is configured, the dep is
 *     present, and it succeeds;
 *   - otherwise the English template copy is the floor.
 * In every case the returned promise resolves (never throws).
 *
 * Validates: Requirements 6.4, 6.5, 6.6, 6.9
 */
describe("Feature: app, Property 8: Translation provider chain resolves deterministically and never throws", () => {
  const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
    "en",
    "es",
    "pt",
    "ht",
    "zh-Hans",
    "vi",
  ];

  const language = fc.constantFrom<SupportedLanguage>(...SUPPORTED_LANGUAGES);

  // A small catalog of translatable keys and their English copy. This stands in
  // for `req.englishByKey`, the template floor.
  const englishByKey = fc.dictionary(
    fc.string({ minLength: 1, maxLength: 12 }),
    fc.string({ maxLength: 20 }),
    { maxKeys: 6 },
  );

  // Marker copies so we can tell which provider actually produced the result.
  const bedrockMarker: Record<string, string> = { __provider: "bedrock" };
  const genericMarker: Record<string, string> = { __provider: "generic" };

  // Build a provider that resolves a marker copy or throws, per `succeeds`.
  function makeProvider(
    marker: Record<string, string>,
    succeeds: boolean,
  ): TranslateProvider {
    return async (_req: TranslateRequest) => {
      if (!succeeds) {
        throw new Error("provider failed");
      }
      return marker;
    };
  }

  it("resolves to the correct provider across every env/outcome combination and never throws", async () => {
    await fc.assert(
      fc.asyncProperty(
        language,
        fc.boolean(), // awsConfigured
        fc.boolean(), // genericKeyConfigured
        fc.boolean(), // bedrockSucceeds
        fc.boolean(), // genericSucceeds
        englishByKey,
        async (
          lang,
          awsConfigured,
          genericKeyConfigured,
          bedrockSucceeds,
          genericSucceeds,
          englishCopy,
        ) => {
          const env: TranslateEnv = { awsConfigured, genericKeyConfigured };

          const req: TranslateRequest = {
            language: lang,
            keys: Object.keys(englishCopy),
            englishByKey: englishCopy,
          };

          // Mirror real usage: only provide a dep when its env flag is on. The
          // impl additionally gates on dep presence, so this is the natural
          // wiring. Both the flag and the dep must line up for a provider to run.
          const deps: TranslateDeps = {};
          if (awsConfigured) {
            deps.bedrock = makeProvider(bedrockMarker, bedrockSucceeds);
          }
          if (genericKeyConfigured) {
            deps.generic = makeProvider(genericMarker, genericSucceeds);
          }

          // Must never throw: a rejected promise would surface here.
          const result = await selectTranslation(env, req, deps);

          if (lang === "en") {
            expect(result.provider).toBe("template");
            expect(result.copy).toBe(req.englishByKey);
            return;
          }

          if (awsConfigured && bedrockSucceeds) {
            expect(result.provider).toBe("bedrock");
            expect(result.copy).toBe(bedrockMarker);
            return;
          }

          if (genericKeyConfigured && genericSucceeds) {
            expect(result.provider).toBe("generic");
            expect(result.copy).toBe(genericMarker);
            return;
          }

          expect(result.provider).toBe("template");
          expect(result.copy).toBe(req.englishByKey);
        },
      ),
      { numRuns: 200 },
    );
  });
});
