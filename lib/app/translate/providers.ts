// lib/app/translate/providers.ts
//
// The translation provider chain. PowerPlan must fully work with no AI key, so
// English templates are the floor: a provider is only tried when its
// environment flag is set and a dependency is supplied, and any failure (or a
// missing provider) falls through to the next option. The function never
// throws.
//
// Provider order: Bedrock (AWS) → generic AI key → English templates.
//
// CRITICAL (Property 9): the request handed to a provider deliberately carries
// ONLY the translatable catalog keys. The two fixed safety lines and the
// Based-On-Input label are never part of `req.keys` / `req.englishByKey` — they
// come exclusively from `lib/app/copy/fixed-strings.ts` and are overlaid later
// by `resolveCopy`. This module must never add those fixed strings to the
// request, so they can never be sent to an AI provider.

// `SupportedLanguage` is declared once in plan-storage; re-export it here so
// callers can import it from the translate layer without a duplicate-identifier
// clash.
export type { SupportedLanguage } from "../plan-storage";

import type { SupportedLanguage } from "../plan-storage";

/** Which translation back ends the environment has made available. */
export interface TranslateEnv {
  /** AWS_* env present → try Amazon Bedrock. */
  awsConfigured: boolean;
  /** A generic AI key is present → try the generic provider. */
  genericKeyConfigured: boolean;
}

/**
 * A single translation request.
 *
 * `keys` and `englishByKey` contain ONLY the translatable catalog keys — never
 * the fixed safety lines or the Based-On-Input label (see the file header).
 */
export interface TranslateRequest {
  language: SupportedLanguage;
  /** Catalog keys to translate (NEVER the fixed strings). */
  keys: string[];
  /** English copy for each translatable key. */
  englishByKey: Record<string, string>;
}

/** A translation provider: turns a request into a key → translated-copy map. */
export type TranslateProvider = (
  req: TranslateRequest,
) => Promise<Record<string, string>>;

/** The injectable providers. Either may be omitted (e.g. in tests or when a key
 *  is absent), in which case that step is skipped. */
export interface TranslateDeps {
  bedrock?: TranslateProvider;
  generic?: TranslateProvider;
}

/** The resolved translation and which provider produced it. */
export interface TranslateResult {
  provider: "bedrock" | "generic" | "template";
  copy: Record<string, string>;
}

/**
 * Resolve copy through the provider chain: Bedrock → generic AI → English
 * templates.
 *
 * Behavior (never throws; English templates are the floor):
 * - `language === "en"` short-circuits straight to the English templates.
 * - Bedrock is tried only when `env.awsConfigured` and `deps.bedrock` are both
 *   present; a thrown error falls through to the next option.
 * - The generic provider is tried only when `env.genericKeyConfigured` and
 *   `deps.generic` are both present; a thrown error falls through.
 * - Otherwise the English template copy (`req.englishByKey`) is returned.
 *
 * @param env  Which providers the environment enables.
 * @param req  The request carrying only translatable keys and their English copy.
 * @param deps The injectable Bedrock / generic providers.
 */
export async function selectTranslation(
  env: TranslateEnv,
  req: TranslateRequest,
  deps: TranslateDeps,
): Promise<TranslateResult> {
  if (req.language === "en") {
    return { provider: "template", copy: req.englishByKey };
  }

  if (env.awsConfigured && deps.bedrock) {
    try {
      return { provider: "bedrock", copy: await deps.bedrock(req) };
    } catch {
      /* fall through to the next provider */
    }
  }

  if (env.genericKeyConfigured && deps.generic) {
    try {
      return { provider: "generic", copy: await deps.generic(req) };
    } catch {
      /* fall through to the template floor */
    }
  }

  return { provider: "template", copy: req.englishByKey };
}
