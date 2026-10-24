import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { toApiResponse } from "../api-envelope";
import type { Result, EngineError } from "@/lib/risk-engine";

/**
 * Feature: app, Property 1: Error results map to error envelopes carrying the
 * code and no value.
 *
 * Validates: Requirements 1.3, 2.5, 2.6, 2.7.
 *
 * For any engine `Result` that is an error (any `EngineError` `code`),
 * `toApiResponse(result, meta)` returns an envelope with `ok === false` whose
 * `error.code` equals the result's `error.code`, and the envelope contains no
 * `value` field.
 */

const RUNS = 100;

/** Every member of the engine's EngineError.code union. */
const errorCodeArb: fc.Arbitrary<EngineError["code"]> = fc.constantFrom(
  "MISSING_COLUMN",
  "PARSE_ERROR",
  "SCHEMA_ERROR",
  "UNKNOWN_ZIP",
  "NEGATIVE_DURATION",
  "FETCH_FAILED",
  "UNPARSEABLE_RESPONSE",
);

/** An error Result<unknown> with an arbitrary code, optional field, message. */
const errorResultArb: fc.Arbitrary<Result<unknown>> = fc
  .record({
    code: errorCodeArb,
    field: fc.option(fc.string(), { nil: undefined }),
    message: fc.string(),
  })
  .map((error) => ({ ok: false, error }) as Result<unknown>);

/** Arbitrary provenance metadata passed alongside the result. */
const metaArb = fc.record({
  source: fc.string(),
  updatedAt: fc.string(),
});

describe("Feature: app, Property 1: Error results map to error envelopes carrying the code and no value", () => {
  it("maps any error Result to ok:false carrying the same code and no value field", () => {
    let runs = 0;
    fc.assert(
      fc.property(errorResultArb, metaArb, (result, meta) => {
        runs += 1;

        const envelope = toApiResponse(result, meta);

        // The envelope must report failure.
        expect(envelope.ok).toBe(false);

        if (envelope.ok === false) {
          // The engine error code is passed through unchanged.
          if (result.ok === false) {
            expect(envelope.error.code).toBe(result.error.code);
          }
        }

        // No fabricated data: the error envelope never exposes a `value` key.
        expect("value" in envelope).toBe(false);
      }),
      { numRuns: RUNS },
    );
    expect(runs).toBeGreaterThanOrEqual(RUNS);
  });

  it("maps an ok Result to ok:true carrying the value and provenance metadata", () => {
    fc.assert(
      fc.property(
        fc.anything(),
        metaArb,
        (value, meta) => {
          const result: Result<unknown> = { ok: true, value };

          const envelope = toApiResponse(result, meta);

          expect(envelope.ok).toBe(true);
          if (envelope.ok === true) {
            expect(envelope.value).toStrictEqual(value);
            expect(envelope.source).toBe(meta.source);
            expect(envelope.updatedAt).toBe(meta.updatedAt);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });
});
