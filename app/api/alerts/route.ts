// GET /api/alerts — live National Weather Service active alerts for Massachusetts.
//
// This route is a thin wrapper over the engine's `fetchActiveAlerts`, which
// already carries its own 5-minute in-memory cache. We deliberately do NOT
// wrap it in another `ttlCache` here to avoid double-caching.
//
// Honesty rules: on `FETCH_FAILED` / `UNPARSEABLE_RESPONSE` the route returns
// 502 with the engine's error code and never fabricates alerts.

import { NextResponse } from "next/server";

import { fetchActiveAlerts } from "@/lib/risk-engine";
import { statusForError, toApiResponse } from "@/lib/app/api-envelope";

// Live data: never statically cached by Next.
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await fetchActiveAlerts();
  const meta = {
    source: "nws-live-alert",
    updatedAt: new Date().toISOString(),
  };

  if (result.ok) {
    return NextResponse.json(toApiResponse(result, meta));
  }

  return NextResponse.json(
    { ok: false, error: result.error },
    { status: statusForError(result.error.code) },
  );
}
