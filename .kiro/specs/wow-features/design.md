# Design Document

## Overview

Spec 3 is additive. It reuses the engine's public scoring API unchanged
(`outreachPriority`, `rankByPriority`, `buildScoringConfig`) and adds new pure
modules under `lib/app/` for the logic that is worth property-testing: replay
counting and plan-hash encoding. UI work lives in `components/` and the two
pages. A separate `tools/powerplan-mcp` package exposes the CSVs to Kiro.

## Architecture

```
tools/powerplan-mcp/      Node stdio MCP server (reads data/*.csv)
  server.mjs              tools: county_summary, top_zips, zip_detail
  lib.mjs                 pure CSV parsing + queries (unit tested)
.kiro/settings/mcp.json   registers the server

public/ma-zip-centroids.json   { "02360": [lat, lng], ... }
data/sim-storm-replay.json     13 hourly frames, simulated

lib/app/replay/replay.ts       pure: frame -> affected ZIPs + counter
lib/app/plan-hash.ts           pure: plan <-> URL fragment
lib/app/speech.ts              pure: build spoken text, pick voice
components/CountyChoropleth.tsx Leaflet: counties + ZIP circles + popups
components/MapLegend.tsx       legend + layer toggles (outside the map)
lib/app/planner/rank.ts        shared ranking helper for map + list
components/StormReplay.tsx     controls + counter (Simulated)
components/ReadAloud.tsx       speechSynthesis buttons
components/FridgeCard.tsx      one-page print card + QR
```

## Components and Interfaces

### MCP server

`lib.mjs` parses the ZIP and county CSVs once and exports pure query functions;
`server.mjs` registers them as tools with zod input schemas. Every count passes
through a `label(n)` helper so 11 reads "11 or fewer". Unknown inputs return an
`isError` result with a plain message and no numbers.

### Replay engine (pure)

```typescript
export interface ReplayFrame { hour: number; label: string; counties: { fips: string; status: "outage" | "restoring" }[] }
export interface ReplayFile { simulated: true; frames: ReplayFrame[] }

export function affectedZips(frame: ReplayFrame, zips: ZipLite[]): ZipLite[];
export function replayCounter(frame: ReplayFrame, zips: ZipLite[]): {
  total: number;          // sum of powerDependentDme.value over affected ZIPs
  maskedZipCount: number; // affected ZIPs whose value is masked (counted as up to 11)
  zipCount: number;
};
export function outageFlagsForFrame(frame: ReplayFrame, zips: ZipLite[]): Map<string, boolean>;
export function clampHour(hour: number, frameCount: number): number;
```

Only counties with `status: "outage"` count as affected. `restoring` counties
are shown but not counted, which keeps the counter honest about "in outage
areas". ZIPs are matched only through the dataset's own `countyFips`, so a FIPS
that has no ZIPs, or a ZIP not in the dataset, can never be counted.

### Plan hash (pure)

```typescript
export function encodePlanHash(plan: ResidentPlan): string;          // "plan=<base64url JSON>"
export function decodePlanHash(hash: string): ResidentPlan | null;   // tolerant; uses deserializePlan
```

Decoding reuses `deserializePlan` so validation stays in one place.

### Planner map

`CountyChoropleth` is extended in place (same file, same dynamic import) rather than replaced. It keeps
`aggregateCountyDependents` shading and adds a `CircleMarker` per ZIP from
`ma-zip-centroids.json`. Radius scales with `sqrt(power_dependent_dme)`; color
uses four priority buckets from the same `outreachPriority` scores the ranked
list uses (computed once on the page and passed down). Color is never the only
signal: the popup and the ranked list carry the score as text. Layer toggles are
plain labeled checkboxes outside the map, so they are keyboard and
screen-reader friendly.

Selection is lifted to the page: `selectedZip` drives the popup, the row
highlight (`aria-current`), and `flyTo`. Row activation uses a button inside the
ZIP cell.

### Storm Replay

`StormReplay` owns `hour` and `playing`. Play advances with a 1.5 s interval;
with `prefers-reduced-motion` the Play button advances exactly one frame and
never starts a timer. The current frame feeds `outageFlagsForFrame` into the
ranked list and the map, and `replayCounter` into the counter. A Simulated
banner sits above the controls.

### Read aloud and fridge card

`buildSpokenPlan(plan, copy, timelineText)` returns the text to speak, always
ending with both safety lines. `pickVoice(voices, lang)` matches by BCP-47
prefix and falls back to English. The fridge card is a print-only layout
(`@media print`) selected by a "Print fridge card" button; the QR is rendered to
a data URL with `qrcode.toDataURL` in the browser.

## Data Models

- `ma-zip-centroids.json`: `Record<zip, [lat, lng]>`, coordinates rounded to 4 decimals.
- `sim-storm-replay.json`: `{ simulated: true, description, source, frames: ReplayFrame[] }`.

## Error Handling

- Missing centroid: the ZIP is listed in `docs/data-notes.md` and simply has no circle; it stays in the ranked list.
- Replay file fails to load: the replay section shows a plain message; live data is unaffected.
- No speech voices: plain note, English fallback. No `speechSynthesis`: controls explain it is unavailable.
- Bad plan hash: ignored; stored plan is kept.

## Testing Strategy

Property tests (fast-check, 100+ runs) on the pure modules, unit tests on the MCP
query helpers, and component tests for controls. Existing tests are kept. The
map is mocked under jsdom, as before.

## Correctness Properties

### Property 1: Counter equals the sum over affected ZIPs

For any frame and ZIP list, `replayCounter(frame, zips).total` equals the sum of
`powerDependentDme.value` over ZIPs whose county has `status: "outage"` in the frame.

**Validates: Requirements 4.7**

### Property 2: Counter never exceeds the statewide total

For any frame and ZIP list, the counter total is at most the sum of
`powerDependentDme.value` over all ZIPs.

**Validates: Requirements 4.9**

### Property 3: Replay is deterministic

For any frame and ZIP list, two calls to `replayCounter` and `affectedZips`
return deep-equal results, and the result does not depend on ZIP input order.

**Validates: Requirements 4.11**

### Property 4: Only known ZIPs are counted

For any frame (including FIPS codes not in the dataset), every ZIP returned by
`affectedZips` is a member of the input ZIP list.

**Validates: Requirements 4.10**

### Property 5: Masked count is reported

For any frame, `maskedZipCount` equals the number of affected ZIPs whose value is masked.

**Validates: Requirements 4.8**

### Property 6: Plan hash round-trips

For any valid `ResidentPlan`, `decodePlanHash(encodePlanHash(plan))` deep-equals the plan,
and for any arbitrary string `decodePlanHash` never throws.

**Validates: Requirements 6.3, 6.4, 6.5**

### Property 7: Spoken plan always includes both safety lines

For any plan and language, `buildSpokenPlan` contains both fixed safety lines.

**Validates: Requirements 5.6**
