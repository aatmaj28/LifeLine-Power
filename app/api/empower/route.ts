// GET /api/empower
//
// Wraps the engine's `loadEmpowerDataset` behind a 5-minute in-memory TTL
// cache. emPOWER data is filesystem-backed and effectively static for the
// demo, so re-reading it on every request is wasteful; the TTL cache keeps the
// parsed dataset warm. On success the dataset is returned with its provenance
// (`source` + `updatedAt`). On an engine error (`MISSING_COLUMN` /
// `PARSE_ERROR`) the route maps the code to an HTTP status and returns the
// engine error verbatim — never fabricated data.

import { NextResponse } from "next/server";
import { loadEmpowerDataset } from "@/lib/risk-engine";
import { toApiResponse, statusForError } from "@/lib/app/api-envelope";
import { ttlCache } from "@/lib/app/cache";

// This route reads the filesystem and serves a large, dynamic payload; it must
// never be statically optimized at build time.
export const dynamic = "force-dynamic";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

// Module-level cache so the parsed dataset is shared across requests in the
// same server instance for the TTL window.
const loadCached = ttlCache(() => loadEmpowerDataset(), FIVE_MINUTES_MS);

export async function GET() {
  const result = await loadCached();

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: statusForError(result.error.code) },
    );
  }

  return NextResponse.json(
    toApiResponse(result, {
      source: "empower-aggregated-deidentified-medicare",
      updatedAt: new Date().toISOString(),
    }),
  );
}
