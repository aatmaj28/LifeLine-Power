// Wire-format envelope for the PowerPlan app's server API routes.
//
// The risk engine returns a discriminated `Result<T>` at every boundary.
// This module maps that onto the shape the client consumes over HTTP, and
// never lets an error carry a `value`. Honesty is preserved end to end:
// a failed lookup surfaces the engine's `code`/`message`, not fabricated data.

import type { Result } from "@/lib/risk-engine";

/**
 * The JSON shape returned by the app's API routes. On success it carries the
 * value plus provenance (`source`, `updatedAt`); on failure it carries only
 * the engine error and never a `value` field.
 */
export type ApiEnvelope<T> =
  | { ok: true; value: T; source: string; updatedAt: string }
  | { ok: false; error: { code: string; field?: string; message: string } };

/**
 * Map an engine {@link Result} onto the wire envelope. On success the value is
 * wrapped with the supplied provenance metadata. On error the engine
 * `code`/`field`/`message` is passed through and NEVER a `value`.
 */
export function toApiResponse<T>(
  result: Result<T>,
  meta: { source: string; updatedAt: string },
): ApiEnvelope<T> {
  if (result.ok) {
    return {
      ok: true,
      value: result.value,
      source: meta.source,
      updatedAt: meta.updatedAt,
    };
  }
  return { ok: false, error: result.error };
}

/** HTTP status for an engine error code. */
export function statusForError(code: string): number {
  switch (code) {
    case "FETCH_FAILED":
    case "UNPARSEABLE_RESPONSE":
      return 502; // upstream (NWS) failure
    case "MISSING_COLUMN":
    case "PARSE_ERROR":
    case "SCHEMA_ERROR":
      return 500; // bad/absent local data
    default:
      return 500;
  }
}
