// app/api/outages/route.ts
//
// GET endpoint exposing the simulated-outage dataset to the planner's Storm
// Scenario layer. It wraps the engine's `loadSimulatedOutages` behind a
// 5-minute TTL cache so the file is not re-read on every request, and returns
// the standard API envelope with `source: "simulated"`.
//
// Honesty rules: on a `SCHEMA_ERROR` the route returns 500 carrying the engine
// error code — never fabricated outage data.

import { NextResponse } from "next/server";

import { loadSimulatedOutages } from "@/lib/risk-engine";
import { toApiResponse, statusForError } from "@/lib/app/api-envelope";
import { ttlCache } from "@/lib/app/cache";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** Module-level cache: the simulated-outage file is static for the demo. */
const cached = ttlCache(() => loadSimulatedOutages(), FIVE_MINUTES_MS);

export async function GET() {
  const result = await cached();
  if (result.ok) {
    const meta = { source: "simulated", updatedAt: new Date().toISOString() };
    return NextResponse.json(toApiResponse(result, meta));
  }
  return NextResponse.json(
    { ok: false, error: result.error },
    { status: statusForError(result.error.code) },
  );
}

export const dynamic = "force-dynamic";
