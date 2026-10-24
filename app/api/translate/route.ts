// app/api/translate/route.ts
//
// POST translation route for the resident experience. Body: `{ language, keys? }`.
//
// PowerPlan must fully work with no AI key, so this route can NEVER error out
// on a translation request: the English template catalog is the guaranteed
// floor. The flow is:
//
//   1. Validate `language`; anything outside the six supported languages falls
//      back to "en" (never a 4xx — the app always works).
//   2. Build a `TranslateRequest` from the catalog. `keys` defaults to every
//      catalog key, or the caller's keys intersected with the catalog. The two
//      fixed safety lines and the Based-On-Input label are NOT catalog keys, so
//      they can never be part of the provider payload (Property 9).
//   3. Resolve through `selectTranslation` (Bedrock → generic AI → templates).
//      For the hackathon no real provider is wired: `deps` is left empty, so
//      the chain falls through to the English templates whenever a key is
//      present but no provider call is available. Real Bedrock / generic
//      provider wiring is a future enhancement; the template fallback is the
//      guaranteed path that keeps the app working with no AI key.
//   4. Overlay the fixed per-language strings via `resolveCopy`.
//   5. Cache the resolved copy per language (Requirement 6.8) and return it.
//
// Generic AI key: this route reads `AI_API_KEY` as the single generic-key env
// var. If it (or an AWS_* var) is set the corresponding provider WOULD be
// tried once wired; today both paths fall through to templates.

import { NextResponse } from "next/server";

import {
  selectTranslation,
  type SupportedLanguage,
  type TranslateEnv,
  type TranslateDeps,
  type TranslateRequest,
} from "@/lib/app/translate/providers";
import {
  EN_CATALOG,
  CATALOG_KEYS,
  type CopyKey,
} from "@/lib/app/copy/catalog";
import { resolveCopy, type ResolvedCopy } from "@/lib/app/copy/resolve";

/** The six supported languages, used to validate the request body. */
const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  "en",
  "es",
  "pt",
  "ht",
  "zh-Hans",
  "vi",
];

/**
 * Per-language cache of resolved copy. Resolution is deterministic for a given
 * language (no live provider wired), so caching the first result and returning
 * it on later requests satisfies the per-language cache requirement (6.8).
 */
const resolvedCache = new Map<SupportedLanguage, ResolvedCopy>();

/** Narrow an unknown value to a supported language, defaulting to English. */
function coerceLanguage(value: unknown): SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(value as SupportedLanguage)
    ? (value as SupportedLanguage)
    : "en";
}

/**
 * Resolve the catalog keys to translate. Defaults to every catalog key; when
 * the caller supplies `keys`, intersect with the catalog so unknown keys are
 * silently dropped and the fixed strings can never be requested.
 */
function resolveRequestedKeys(rawKeys: unknown): CopyKey[] {
  if (!Array.isArray(rawKeys)) return [...CATALOG_KEYS];
  const catalogSet = new Set<string>(CATALOG_KEYS);
  const wanted = rawKeys.filter(
    (k): k is CopyKey => typeof k === "string" && catalogSet.has(k),
  );
  return wanted.length > 0 ? wanted : [...CATALOG_KEYS];
}

/** Read which translation back ends the environment enables. */
function readTranslateEnv(): TranslateEnv {
  return {
    awsConfigured: Boolean(process.env.AWS_REGION || process.env.AWS_ACCESS_KEY_ID),
    genericKeyConfigured: Boolean(process.env.AI_API_KEY),
  };
}

/**
 * POST `/api/translate`.
 *
 * Always returns `{ ok: true, language, provider, copy }` with at least the
 * English template catalog. A malformed body is tolerated — it simply resolves
 * English copy for the default language.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    /* tolerate a missing/invalid body — fall back to defaults below */
  }

  const parsed = (body ?? {}) as { language?: unknown; keys?: unknown };
  const language = coerceLanguage(parsed.language);

  // Serve from the per-language cache when present (Requirement 6.8).
  const cached = resolvedCache.get(language);
  if (cached) {
    return NextResponse.json({
      ok: true,
      language,
      provider: "template",
      copy: cached,
    });
  }

  const keys = resolveRequestedKeys(parsed.keys);
  const englishByKey: Record<string, string> = {};
  for (const key of keys) englishByKey[key] = EN_CATALOG[key];

  const req: TranslateRequest = { language, keys, englishByKey };
  const env = readTranslateEnv();
  // No real provider wired yet: the empty deps force the chain to fall through
  // to the English templates, which guarantees the route works with no AI key.
  const deps: TranslateDeps = {};

  const { provider, copy } = await selectTranslation(env, req, deps);

  const resolved = resolveCopy(
    language,
    copy as Partial<Record<CopyKey, string>>,
  );

  resolvedCache.set(language, resolved);

  return NextResponse.json({
    ok: true,
    language,
    provider,
    copy: resolved,
  });
}
