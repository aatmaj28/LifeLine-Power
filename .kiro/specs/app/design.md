# Design Document

## Overview

PowerPlan's UI layer is a Next.js (App Router) application in TypeScript and Tailwind, deployed on Vercel. It sits entirely on top of the already-completed `lib/risk-engine` library and consumes only its public barrel (`lib/risk-engine`). The UI never re-implements loaders, scoring, ranking, battery arithmetic, or small-count behavior; it imports them.

The design has three layers:

1. **Server API routes** (`app/api/*`) wrap the engine's filesystem/network loaders and expose JSON. `loadEmpowerDataset` and `loadSimulatedOutages` read the filesystem, so they run only on the server. A small TTL cache (≈5 minutes) wraps emPOWER and outages; alerts reuse the engine's own in-memory cache. Every route maps an engine `Result` to a uniform JSON envelope `{ ok, value | error }` and returns a proper HTTP error status on failure — never fabricated data.
2. **Pages** — `/` (landing, server component), `/plan` (resident, mobile-first, client components for localStorage + share + language), `/planner` (desktop dashboard; the Leaflet map is loaded client-only via `dynamic(..., { ssr: false })` because Leaflet needs `window`).
3. **Shared components and pure helpers** — presentation components under `components/`, and a thin set of pure helper functions under `lib/app/` that this spec introduces (envelope mapping, plan serialization, copy resolution, county aggregation, config building, outage flagging). The pure helpers are the only new logic worth property-testing; the engine's logic is already covered by its own property tests.

Honesty, plain language, and accessibility are structural: a `DataSourceBadge` (source + last-updated) appears on every data view, a `SimulatedBadge` appears only on simulated layers, the two `Fixed_Safety_Lines` always render on the resident page, `SmallCount.label` renders "11 or fewer" where masked, and both main pages target WCAG 2.2 AA with the ranked list as the non-map path to the data.

## Architecture

```
Browser
  ┌───────────────────────────────────────────────────────────┐
  │  /            Landing (server component)                    │
  │  /plan        Resident (client: localStorage, share, lang)  │
  │  /planner     Planner (client map via dynamic ssr:false)    │
  └───────────────┬───────────────────────────────────────────┘
                  │ fetch (ZIP only for resident lookups)
                  ▼
  ┌───────────────────────────────────────────────────────────┐
  │  app/api/empower    → loadEmpowerDataset   (TTL cache ~5m)  │
  │  app/api/alerts     → fetchActiveAlerts    (engine cache)   │
  │  app/api/outages    → loadSimulatedOutages (TTL cache ~5m)  │
  │  app/api/translate  → provider chain + template catalog     │
  │                       (per-language cache)                  │
  └───────────────┬───────────────────────────────────────────┘
                  │ import (server only for FS loaders)
                  ▼
  ┌───────────────────────────────────────────────────────────┐
  │  lib/risk-engine  (public barrel — consumed, never copied)  │
  │  loadEmpowerDataset · fetchActiveAlerts · parseNwsResponse  │
  │  mapAlertsToZips · compareSeverity · SEVERITY_ORDER         │
  │  loadSimulatedOutages · validateOutages                     │
  │  outreachPriority · rankByPriority · batteryTimeline        │
  │  makeSmallCount · types                                     │
  └───────────────────────────────────────────────────────────┘
```

### Directory layout (new files this spec adds)

```
app/
  page.tsx                      Landing (server component)
  plan/page.tsx                 Resident page (client)
  planner/page.tsx              Planner page (client; map dynamic)
  api/
    empower/route.ts            GET → loadEmpowerDataset (TTL cache)
    alerts/route.ts             GET → fetchActiveAlerts
    outages/route.ts            GET → loadSimulatedOutages (TTL cache)
    translate/route.ts          POST → provider chain + templates (per-lang cache)
components/
  DataSourceBadge.tsx           source + last-updated, every data view
  SimulatedBadge.tsx            "Simulated" badge for simulated layers only
  SafetyLines.tsx               renders both Fixed_Safety_Lines
  LanguagePicker.tsx            six Supported_Languages
  OutagePlanCard.tsx            resident result card (print-friendly)
  CountyChoropleth.tsx          Leaflet map (client-only)
  RankedList.tsx                non-map alternative to the map
lib/app/
  api-envelope.ts               toApiResponse(result) + ApiEnvelope type
  cache.ts                      ttlCache(load, ttlMs, now)
  plan-storage.ts               ResidentPlan type, serialize/deserialize, usePlanStorage
  battery-format.ts             formatBatteryTimeline(timeline, copy)
  share.ts                      buildShareText(plan)
  copy/
    catalog.ts                  Template_Catalog (English source of truth)
    fixed-strings.ts            per-language Fixed_Safety_Lines + Based_On_Input_Label
    resolve.ts                  resolveCopy(language, aiCopy?) → merged copy
  translate/
    providers.ts                selectTranslation(env, request) provider chain
  planner/
    aggregate.ts                aggregateCountyDependents(zipRecords)
    scoring-config.ts           buildScoringConfig(dataset)
    outage-flags.ts             outageFlagsByZip(outages, dataset, now)
public/
  ma-counties.geojson           lightweight 14-county MA GeoJSON for the choropleth
```

### Request/response envelope

All routes return the same shape so clients branch on `ok`:

```typescript
// lib/app/api-envelope.ts
import type { Result } from "@/lib/risk-engine";

export type ApiEnvelope<T> =
  | { ok: true; value: T; source: string; updatedAt: string }
  | { ok: false; error: { code: string; field?: string; message: string } };

/** Map an engine Result onto the wire envelope. Errors carry the engine
 *  code/message and NEVER a value. */
export function toApiResponse<T>(
  result: Result<T>,
  meta: { source: string; updatedAt: string },
): ApiEnvelope<T> {
  if (result.ok) {
    return { ok: true, value: result.value, source: meta.source, updatedAt: meta.updatedAt };
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
```

### TTL cache

emPOWER and outages are filesystem-backed and effectively static for the demo, so a tiny per-route in-memory TTL avoids re-reading on every request. The clock is injectable for tests.

```typescript
// lib/app/cache.ts
export function ttlCache<T>(
  load: () => Promise<T>,
  ttlMs: number,
): (now?: number) => Promise<T> {
  let entry: { at: number; value: T } | null = null;
  return async (now = Date.now()) => {
    if (entry && now - entry.at < ttlMs) return entry.value;
    const value = await load();
    entry = { at: now, value };
    return value;
  };
}
```

Alerts are NOT double-cached here: `fetchActiveAlerts` already carries a 5-minute in-memory cache in the engine, so `app/api/alerts/route.ts` calls it directly.

## Components and Interfaces

### Server API routes

**`app/api/empower/route.ts`** (GET) — wraps `loadEmpowerDataset` behind a 5-minute `ttlCache`. On success returns `{ ok, value: dataset, source: "empower-aggregated-deidentified-medicare", updatedAt }`. On a `MISSING_COLUMN` / `PARSE_ERROR` the route returns `statusForError(code)` with `{ ok: false, error }`.

**`app/api/alerts/route.ts`** (GET) — calls `fetchActiveAlerts()` (engine-cached). On `FETCH_FAILED` / `UNPARSEABLE_RESPONSE` returns 502 with the code, never fabricated alerts. `source: "nws-live-alert"`, `updatedAt` is the fetch time.

**`app/api/outages/route.ts`** (GET) — wraps `loadSimulatedOutages` behind a 5-minute `ttlCache`. On `SCHEMA_ERROR` returns 500 with the code. `source: "simulated"`.

**`app/api/translate/route.ts`** (POST) — body `{ language: SupportedLanguage, keys: string[] }`. Resolves copy through the provider chain (below), merges in fixed per-language strings for the safety lines and the Based-On-Input label, caches per language, and returns the resolved copy map. Always succeeds with at least the English template catalog.

### Translation provider chain

```typescript
// lib/app/translate/providers.ts
export type SupportedLanguage = "en" | "es" | "pt" | "ht" | "zh-Hans" | "vi";

export interface TranslateEnv {
  awsConfigured: boolean;     // AWS_* env present → try Bedrock
  genericKeyConfigured: boolean; // generic AI key present
}

export interface TranslateRequest {
  language: SupportedLanguage;
  keys: string[];             // catalog keys to translate (NEVER the fixed strings)
  englishByKey: Record<string, string>;
}

/** Try Bedrock → generic AI → English templates. Never throws; a provider
 *  failure falls through to the next, and English templates are the floor. */
export async function selectTranslation(
  env: TranslateEnv,
  req: TranslateRequest,
  deps: {
    bedrock?: (r: TranslateRequest) => Promise<Record<string, string>>;
    generic?: (r: TranslateRequest) => Promise<Record<string, string>>;
  },
): Promise<{ provider: "bedrock" | "generic" | "template"; copy: Record<string, string> }> {
  if (env.language === "en") return { provider: "template", copy: req.englishByKey };
  if (env.awsConfigured && deps.bedrock) {
    try { return { provider: "bedrock", copy: await deps.bedrock(req) }; } catch { /* fall through */ }
  }
  if (env.genericKeyConfigured && deps.generic) {
    try { return { provider: "generic", copy: await deps.generic(req) }; } catch { /* fall through */ }
  }
  return { provider: "template", copy: req.englishByKey };
}
```

The `keys` passed to a provider deliberately exclude the two `Fixed_Safety_Lines` and the `Based_On_Input_Label`; those come only from `lib/app/copy/fixed-strings.ts`. `resolveCopy(language, aiCopy?)` merges: start from the English catalog, overlay AI copy for the translatable keys, then overlay the fixed per-language strings last so they always win.

### Pure helpers (planner + resident)

```typescript
// lib/app/planner/aggregate.ts
import type { EmpowerZipRecord } from "@/lib/risk-engine";
/** Sum power_dependent_dme.value per county_fips. */
export function aggregateCountyDependents(
  zipRecords: EmpowerZipRecord[],
): Map<string, number> { /* group by countyFips, sum powerDependentDme.value */ }

// lib/app/planner/scoring-config.ts
import type { EmpowerDataset, ScoringConfig } from "@/lib/risk-engine";
/** dependentMax = max ZIP power_dependent_dme (>=1); strictly
 *  increasing severityWeight none<Minor<Moderate<Severe<Extreme. */
export function buildScoringConfig(dataset: EmpowerDataset): ScoringConfig { /* ... */ }

// lib/app/planner/outage-flags.ts
import type { SimulatedOutage, EmpowerDataset } from "@/lib/risk-engine";
/** Map ZIP → hasActiveOutage: true iff some ACTIVE simulated outage matches the
 *  ZIP directly or via its county. */
export function outageFlagsByZip(
  outages: SimulatedOutage[],
  dataset: EmpowerDataset,
): Map<string, boolean> { /* ... */ }

// lib/app/battery-format.ts
import type { Timeline } from "@/lib/risk-engine";
/** Render "If power goes out at 6 PM, your battery covers about 4 hours, until
 *  about 10 PM" + the Based_On_Input_Label. Pure: formats the given Timeline. */
export function formatBatteryTimeline(
  timeline: Timeline,
  copy: { basedOnInputLabel: string },
): string { /* ... */ }

// lib/app/share.ts
import type { ResidentPlan } from "./plan-storage";
/** Plain-text share body built from in-browser data. Contains NO URL encoding
 *  resident PII (names/phones/devices). */
export function buildShareText(plan: ResidentPlan): string { /* ... */ }
```

### Resident page (`/plan`)

- **Form**: ZIP; device types (multi-select from a fixed device list); backup battery hours (reject `< 0`, reusing the engine's `NEGATIVE_DURATION` semantics via `batteryTimeline`); up to 3 contacts (name + phone). State persists through `usePlanStorage`, which serializes `ResidentPlan` to localStorage. Only the ZIP is sent to `/api/alerts` and `/api/empower`.
- **Outage Plan card** (`OutagePlanCard`): device types, battery hours, battery timeline (`batteryTimeline(hours, userStart)` → `formatBatteryTimeline`, always labeled "based on what you entered"), contacts, steps-before-storm, official help numbers (Mass 211, 911 guidance, utility medical/life-support registration — only verified numbers, cited in `docs/data-notes.md`), and both `Fixed_Safety_Lines` via `SafetyLines`. No medical advice, no evacuation timing.
- **Print**: `@media print` stylesheet renders the card cleanly.
- **Share**: `navigator.share` when present, else copy-to-clipboard + print. Share text comes from `buildShareText(plan)`; resident data is never encoded into a URL.
- **Language**: `LanguagePicker` → request `/api/translate { language, keys }`; render resolved copy. With no AI key, English templates render everywhere without error.

### Planner page (`/planner`)

- Fetches `/api/empower` (dataset with `county[]` and `zip[]`), `/api/alerts`, and — when Storm Scenario is on — `/api/outages`.
- **`CountyChoropleth`** (client-only via `dynamic(..., { ssr: false })`): colors the 14 MA counties from `public/ma-counties.geojson` by `aggregateCountyDependents`, using a severity-to-color bucket scale by count. Clicking a county selects it and filters `RankedList` to that county's ZIPs. Active NWS alerts overlay via `mapAlertsToZips` / per-county highest severity (`compareSeverity`).
- **`RankedList`** (non-map path, same data): builds `ScoringInputs` per ZIP and calls `outreachPriority(inputs, buildScoringConfig(dataset), knownZips)` then `rankByPriority`. Each row shows `score` and `reasons`.
- **Storm Scenario toggle**: off = live emPOWER + live alerts only; on = add the simulated-outage layer (with `SimulatedBadge` on that layer only) and set `hasActiveOutage` per ZIP via `outageFlagsByZip` before scoring.
- **Honest labeling**: `DataSourceBadge` on every view; emPOWER labeled aggregated/de-identified Medicare; `SmallCount.label` renders "11 or fewer".

## Data Models

The app introduces one new persisted model; everything else is an engine type consumed as-is.

```typescript
// lib/app/plan-storage.ts
export interface ResidentContact { name: string; phone: string; }

export interface ResidentPlan {
  zip: string;
  deviceTypes: string[];        // from the fixed device list
  batteryHours: number;         // non-negative (validated before store)
  contacts: ResidentContact[];  // max length 3
  language: SupportedLanguage;
}

export function serializePlan(plan: ResidentPlan): string;     // JSON
export function deserializePlan(text: string): ResidentPlan | null; // tolerant of bad input
```

Consumed engine types (not redefined): `EmpowerDataset`, `EmpowerZipRecord`, `EmpowerCountyRecord`, `NwsAlert`, `ZipAlert`, `Severity`, `SEVERITY_ORDER`, `SimulatedOutage`, `ScoringInputs`, `ScoringConfig`, `ScoreResult`, `Reason`, `Timeline`, `SmallCount`, `Result`, `EngineError`.

## Error Handling

- **Engine `Result` errors** map through `toApiResponse`: the envelope carries the engine `code`, `field`, and `message`, and never a `value`. `statusForError` picks the HTTP status (502 for NWS upstream failures, 500 for local-data failures). No route ever substitutes fabricated data for an error.
- **Negative battery hours**: the resident form validates `>= 0` before storing; `batteryTimeline` is the engine authority and returns `NEGATIVE_DURATION`, which the UI surfaces as a non-negative prompt.
- **Missing AI configuration / provider failure**: `selectTranslation` falls through to English templates and never throws; the resident page always renders.
- **Unknown ZIP in scoring**: `outreachPriority` returns `UNKNOWN_ZIP`; the planner simply omits that ZIP from the ranked list rather than inventing a score.
- **Map runtime (`window`) on server**: avoided by loading the Leaflet component only on the client (`ssr: false`); the ranked list remains available without the map.

## Testing Strategy

**Dual approach.** Example/component tests (Vitest + Testing Library) cover rendering, interaction branches, routing, and the capability-dependent share flow. Integration tests (1–3 examples) cover route wiring and external-service behavior. Automated `axe` checks run on `/plan` and `/planner`. Property-based tests (fast-check, ≥100 iterations each) cover ONLY the new pure helpers below — the engine's loaders, scoring, ranking, battery arithmetic, and small-count already have their own property tests and are not re-tested here.

- **Unit/example**: landing content + navigation; form fields and the max-3-contacts cap; card completeness (devices, contacts, battery hours, steps, help numbers); print stylesheet; share branches; language picker options; per-language translate cache; county click → ranked filter; ranked row shows score + reasons; badges and labels; small-count label.
- **Integration**: each route's success + one forced-failure example; alerts overlay; translate route provider selection end-to-end; axe on both pages.
- **Property**: the twelve properties below.

Each property test is tagged **Feature: app, Property {number}: {property_text}** and references its design property.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

These properties target only the pure helper functions this spec introduces. They are not about React rendering; rendering, routing, and external-service behavior are covered by example and integration tests.

### Property 1: Error results map to error envelopes carrying the code and no value

For any engine `Result` that is an error (any `EngineError` `code`), `toApiResponse(result, meta)` returns an envelope with `ok === false` whose `error.code` equals the result's `error.code`, and the envelope contains no `value` field.

**Validates: Requirements 1.3, 2.5, 2.6, 2.7**

### Property 2: Resident plan serialization round-trips

For any valid `ResidentPlan`, `deserializePlan(serializePlan(plan))` deep-equals the original `plan`.

**Validates: Requirements 4.3**

### Property 3: Battery-hours validation accepts exactly the non-negative values

For any number `h`, the resident battery-hours validator rejects `h` when `h < 0` and accepts `h` when `h >= 0`, consistent with the engine's `NEGATIVE_DURATION` semantics (`batteryTimeline(h, start)` errors iff `h < 0`).

**Validates: Requirements 4.6**

### Property 4: Battery timeline presenter is always labeled and well-ordered

For any `Timeline` produced by `batteryTimeline(hours, start)` with `hours >= 0`, `formatBatteryTimeline(timeline, copy)` contains the `Based_On_Input_Label` and renders a window whose end (derived from `depletion`) is never before its start (since `depletion >= start`).

**Validates: Requirements 5.3**

### Property 5: Share text never encodes resident data in a URL

For any `ResidentPlan`, `buildShareText(plan)` contains no URL whose query string or fragment encodes the resident's contact names, contact phone numbers, or device list.

**Validates: Requirements 5.9**

### Property 6: Resolved resident copy always includes both fixed safety lines

For any `Supported_Language` (and regardless of whether AI copy is present), the resolved resident copy includes both `Fixed_Safety_Lines` verbatim from the fixed per-language table.

**Validates: Requirements 5.4, 9.5**

### Property 7: The template catalog resolves every resident key to non-empty English copy

For any resident copy key used by the app, the English `Template_Catalog` returns a non-empty string (no missing keys).

**Validates: Requirements 6.2**

### Property 8: Translation provider chain resolves deterministically and never throws

For any combination of environment (AWS configured?, generic key configured?) and provider outcomes (each configured provider succeeds or fails), `selectTranslation` resolves to Bedrock when AWS is configured and Bedrock succeeds, otherwise to the generic provider when it is configured and succeeds, otherwise always to the English template copy — and it never throws.

**Validates: Requirements 6.4, 6.5, 6.6, 6.9**

### Property 9: Fixed strings are never sent to an AI provider

For any `Supported_Language` and any translate request, the request payload passed to an AI provider contains neither of the `Fixed_Safety_Lines` nor the `Based_On_Input_Label`; those values in the resolved output come from the fixed per-language table.

**Validates: Requirements 6.7**

### Property 10: County aggregation equals the sum of its ZIPs and is monotonic

For any list of `EmpowerZipRecord`s, `aggregateCountyDependents` yields, for each county FIPS, a total equal to the sum of the `power_dependent_dme.value` of its ZIP records; and increasing any single ZIP's `power_dependent_dme.value` never decreases that ZIP's county total.

**Validates: Requirements 7.1**

### Property 11: Scoring config uses the dataset-wide max and a strictly-increasing severity weight

For any `EmpowerDataset`, `buildScoringConfig(dataset).dependentMax` equals the maximum `power_dependent_dme.value` across the dataset's ZIP records (and is positive; county totals are excluded so the denominator is on the same per-ZIP scale as the numerator — changed after spec 3, see docs/decisions.md), and `severityWeight` is strictly increasing in `SEVERITY_ORDER` (none < Minor < Moderate < Severe < Extreme).

**Validates: Requirements 7.7**

### Property 12: A ZIP is flagged with an active outage exactly when an active simulated outage matches it

For any set of `SimulatedOutage`s and any `EmpowerDataset`, `outageFlagsByZip` marks a ZIP `hasActiveOutage === true` if and only if some outage with `active === true` matches that ZIP directly (by `zip`) or via its county (by `county`/`countyFips`).

**Validates: Requirements 8.3**
