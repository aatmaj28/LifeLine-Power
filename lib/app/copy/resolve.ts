// lib/app/copy/resolve.ts
//
// `resolveCopy` merges resident-facing copy into the final strings the `/plan`
// page and Outage Plan card render. It layers three sources so the right one
// always wins:
//
//   1. The English `EN_CATALOG` is the base for every `CopyKey`. With no AI
//      provider configured — or when a provider fails — the app still renders
//      complete English copy and keeps working (Requirement 6.9).
//   2. Any `aiCopy` (translated catalog keys) overlays the English base. Only
//      translatable catalog keys live here; it is a `Partial` map, so keys the
//      provider did not translate fall back to English.
//   3. The fixed per-language strings overlay LAST. The two safety lines and
//      the based-on-input label come straight from `fixed-strings.ts`, are
//      never part of the AI-translatable catalog, and so can never be
//      overridden by AI or template copy (Property 6).

import { EN_CATALOG, type CopyKey } from "./catalog";
import { getFixedStrings } from "./fixed-strings";
import type { SupportedLanguage } from "../plan-storage";

/**
 * The fully resolved resident copy for one language.
 *
 * @property catalog every {@link CopyKey} resolved to its final string:
 *   English overlaid with any AI translation.
 * @property safetyLine1 fixed safety line, verbatim from the per-language table.
 * @property safetyLine2 fixed safety line, verbatim from the per-language table.
 * @property basedOnInputLabel fixed based-on-input label, verbatim per language.
 */
export interface ResolvedCopy {
  catalog: Record<CopyKey, string>;
  safetyLine1: string;
  safetyLine2: string;
  basedOnInputLabel: string;
}

/**
 * Merge resident copy for `language`, letting the fixed per-language strings win.
 *
 * The catalog starts from English and is overlaid with `aiCopy` (translatable
 * catalog keys only). The three fixed strings are then taken directly from
 * {@link getFixedStrings}; because they are not catalog keys, no `aiCopy` value
 * can touch them, so the two safety lines and the based-on-input label are
 * always the fixed per-language strings (Property 6).
 *
 * @param language the resident's {@link SupportedLanguage}.
 * @param aiCopy optional translated catalog keys to overlay over English.
 * @returns the {@link ResolvedCopy} for `language`.
 */
export function resolveCopy(
  language: SupportedLanguage,
  aiCopy?: Partial<Record<CopyKey, string>>,
): ResolvedCopy {
  const catalog: Record<CopyKey, string> = {
    ...EN_CATALOG,
    ...(aiCopy ?? {}),
  };

  const fixed = getFixedStrings(language);

  return {
    catalog,
    safetyLine1: fixed.safetyLine1,
    safetyLine2: fixed.safetyLine2,
    basedOnInputLabel: fixed.basedOnInputLabel,
  };
}
