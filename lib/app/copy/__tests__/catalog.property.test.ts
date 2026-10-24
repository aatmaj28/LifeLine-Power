import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  EN_CATALOG,
  CATALOG_KEYS,
  getEnglishCopy,
  type CopyKey,
} from "../catalog";

/**
 * Property 7: The template catalog resolves every resident key to non-empty
 * English copy.
 *
 * For any resident copy key used by the app, the English `Template_Catalog`
 * returns a non-empty string (no missing keys).
 *
 * Validates: Requirements 6.2
 */
describe("Feature: app, Property 7: The template catalog resolves every resident key to non-empty English copy", () => {
  // Any resident copy key the app can resolve. Drawn from CATALOG_KEYS so the
  // generator stays in sync with the catalog's key space automatically.
  const anyCopyKey = fc.constantFrom<CopyKey>(...CATALOG_KEYS);

  it("returns a non-empty string for any resident copy key", () => {
    fc.assert(
      fc.property(anyCopyKey, (key) => {
        const copy = getEnglishCopy(key);
        expect(typeof copy).toBe("string");
        expect(copy.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });

  // Exhaustive, non-fast-check check: every key in CATALOG_KEYS maps to a
  // non-empty string in EN_CATALOG. This guarantees no missing or blank key.
  it("maps every catalog key to a non-empty string in EN_CATALOG", () => {
    expect(CATALOG_KEYS.length).toBeGreaterThan(0);
    for (const key of CATALOG_KEYS) {
      const value = EN_CATALOG[key];
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });
});
