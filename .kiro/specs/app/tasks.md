# Implementation Plan: App (PowerPlan UI Layer)

## Overview

Build the PowerPlan UI layer on top of the completed `lib/risk-engine`, consuming only its public barrel. Work proceeds bottom-up: install dependencies and the data asset, then the pure `lib/app/` helpers (each with its property test), then the server API routes that wrap the engine behind the envelope + TTL cache, then the presentation components, then the three pages, and finally cross-cutting honest-labeling and accessibility verification. Every task references specific requirements. The design uses TypeScript throughout, so all tasks are TypeScript.

## Tasks

- [x] 1. Install dependencies and add the MA counties data asset
  - [x] 1.1 Install map and axe testing dependencies
    - Add `leaflet`, `react-leaflet` and `@types/leaflet` to dependencies
    - Add an axe testing library (`vitest-axe` or `jest-axe`) and `jsdom` to devDependencies for the two-page axe checks
    - Ensure `vitest.config.ts` uses the `jsdom` environment for component/axe tests
    - _Requirements: 7.1, 10.5_
  - [x] 1.2 Add `public/ma-counties.geojson`
    - Create a real, lightweight GeoJSON FeatureCollection of the 14 Massachusetts counties
    - Each feature keyed with a `county_fips` property so it joins to the engine's `county_fips`
    - Keep geometry simplified/small enough for client delivery
    - _Requirements: 7.1_

- [x] 2. Implement the API envelope and TTL cache helpers
  - [x] 2.1 Implement `lib/app/api-envelope.ts`
    - Define `ApiEnvelope<T>` and implement `toApiResponse(result, meta)` and `statusForError(code)`
    - Error results carry the engine `code`/`field`/`message` and never a `value`
    - Map `FETCH_FAILED`/`UNPARSEABLE_RESPONSE` → 502, local-data errors → 500
    - _Requirements: 1.3, 2.5, 2.6, 2.7_
  - [x]* 2.2 Write property test for `toApiResponse`
    - **Feature: app, Property 1: Error results map to error envelopes carrying the code and no value**
    - **Validates: Requirements 1.3, 2.5, 2.6, 2.7**
  - [x] 2.3 Implement `lib/app/cache.ts`
    - Implement `ttlCache(load, ttlMs)` returning `(now?) => Promise<T>` with an injectable clock
    - _Requirements: 2.4_
  - [x]* 2.4 Write unit tests for `ttlCache`
    - Test cache hit within TTL, refresh after TTL, and injected clock behavior
    - _Requirements: 2.4_

- [x] 3. Implement resident plan storage and the battery-hours validator
  - [x] 3.1 Implement `lib/app/plan-storage.ts`
    - Define `ResidentContact`, `ResidentPlan`, `serializePlan`, `deserializePlan` (tolerant of bad input)
    - Implement the `usePlanStorage` hook persisting `ResidentPlan` to localStorage only
    - Implement the battery-hours validator: reject `h < 0`, accept `h >= 0` (consistent with engine `NEGATIVE_DURATION`)
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_
  - [x]* 3.2 Write property test for plan serialization round-trip
    - **Feature: app, Property 2: Resident plan serialization round-trips**
    - **Validates: Requirements 4.3**
  - [x]* 3.3 Write property test for the battery-hours validator
    - **Feature: app, Property 3: Battery-hours validation accepts exactly the non-negative values**
    - **Validates: Requirements 4.6**

- [x] 4. Implement the resident presentation helpers
  - [x] 4.1 Implement `lib/app/battery-format.ts`
    - Implement `formatBatteryTimeline(timeline, copy)` rendering the window plus the `Based_On_Input_Label`
    - Pure formatting of a given `Timeline`; window end is never before its start
    - _Requirements: 5.3_
  - [x]* 4.2 Write property test for the battery timeline presenter
    - **Feature: app, Property 4: Battery timeline presenter is always labeled and well-ordered**
    - **Validates: Requirements 5.3**
  - [x] 4.3 Implement `lib/app/share.ts`
    - Implement `buildShareText(plan)` from in-browser data, never encoding resident PII into a URL
    - _Requirements: 5.9_
  - [x]* 4.4 Write property test for share text
    - **Feature: app, Property 5: Share text never encodes resident data in a URL**
    - **Validates: Requirements 5.9**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement the copy catalog, fixed strings, and resolver
  - [x] 6.1 Implement `lib/app/copy/catalog.ts`
    - Build the English `Template_Catalog` as the no-AI source of truth; every resident key maps to non-empty copy
    - _Requirements: 6.2_
  - [x]* 6.2 Write property test for the template catalog
    - **Feature: app, Property 7: The template catalog resolves every resident key to non-empty English copy**
    - **Validates: Requirements 6.2**
  - [x] 6.3 Implement `lib/app/copy/fixed-strings.ts`
    - Per-language `Fixed_Safety_Lines` (both sentences) and `Based_On_Input_Label`; never AI-translated
    - _Requirements: 5.4, 6.7, 9.5_
  - [x] 6.4 Implement `lib/app/copy/resolve.ts`
    - Implement `resolveCopy(language, aiCopy?)`: English catalog base, overlay AI copy, overlay fixed per-language strings last so they always win
    - _Requirements: 5.4, 6.3, 9.5_
  - [x]* 6.5 Write property test for resolved copy safety lines
    - **Feature: app, Property 6: Resolved resident copy always includes both fixed safety lines**
    - **Validates: Requirements 5.4, 9.5**

- [x] 7. Implement the translation provider chain
  - [x] 7.1 Implement `lib/app/translate/providers.ts`
    - Implement `selectTranslation(env, req, deps)`: Bedrock → generic → English templates; never throws; `en` short-circuits to templates
    - Exclude the fixed strings from any provider payload (keys never include safety lines or the label)
    - _Requirements: 6.4, 6.5, 6.6, 6.7, 6.9_
  - [x]* 7.2 Write property test for provider-chain resolution
    - **Feature: app, Property 8: Translation provider chain resolves deterministically and never throws**
    - **Validates: Requirements 6.4, 6.5, 6.6, 6.9**
  - [x]* 7.3 Write property test for fixed-string exclusion
    - **Feature: app, Property 9: Fixed strings are never sent to an AI provider**
    - **Validates: Requirements 6.7**

- [x] 8. Implement the planner pure helpers
  - [x] 8.1 Implement `lib/app/planner/aggregate.ts`
    - Implement `aggregateCountyDependents(zipRecords)` summing `power_dependent_dme.value` per `county_fips`
    - _Requirements: 7.1_
  - [x]* 8.2 Write property test for county aggregation
    - **Feature: app, Property 10: County aggregation equals the sum of its ZIPs and is monotonic**
    - **Validates: Requirements 7.1**
  - [x] 8.3 Implement `lib/app/planner/scoring-config.ts`
    - Implement `buildScoringConfig(dataset)`: `dependentMax` = dataset-wide max (`>= 1`); strictly-increasing `severityWeight`
    - _Requirements: 7.7_
  - [x]* 8.4 Write property test for scoring config
    - **Feature: app, Property 11: Scoring config uses the dataset-wide max and a strictly-increasing severity weight**
    - **Validates: Requirements 7.7**
  - [x] 8.5 Implement `lib/app/planner/outage-flags.ts`
    - Implement `outageFlagsByZip(outages, dataset)`: ZIP → `hasActiveOutage` true iff an active outage matches by `zip` or via county
    - _Requirements: 8.3_
  - [x]* 8.6 Write property test for outage flagging
    - **Feature: app, Property 12: A ZIP is flagged with an active outage exactly when an active simulated outage matches it**
    - **Validates: Requirements 8.3**

- [x] 9. Checkpoint - Ensure all helper tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement the server API routes
  - [x] 10.1 Implement `app/api/empower/route.ts`
    - GET wrapping `loadEmpowerDataset` behind a 5-minute `ttlCache`; success returns the dataset with `source` + `updatedAt`
    - On `MISSING_COLUMN`/`PARSE_ERROR` return `statusForError(code)` with `{ ok: false, error }`, no fabricated data
    - _Requirements: 1.1, 2.1, 2.4, 2.7_
  - [x] 10.2 Implement `app/api/alerts/route.ts`
    - GET calling `fetchActiveAlerts()` (engine cache, not double-cached); `source: "nws-live-alert"`, `updatedAt` = fetch time
    - On `FETCH_FAILED`/`UNPARSEABLE_RESPONSE` return 502 with the code, never fabricated alerts
    - _Requirements: 1.1, 2.2, 2.5, 2.6_
  - [x] 10.3 Implement `app/api/outages/route.ts`
    - GET wrapping `loadSimulatedOutages` behind a 5-minute `ttlCache`; `source: "simulated"`
    - On `SCHEMA_ERROR` return 500 with the code, no fabricated data
    - _Requirements: 1.1, 2.3, 2.4, 2.7_
  - [x] 10.4 Implement `app/api/translate/route.ts`
    - POST `{ language, keys }`; resolve through `selectTranslation` + `resolveCopy`, overlay fixed strings, cache per language
    - Always succeeds with at least the English template catalog
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_
  - [x]* 10.5 Write integration tests for the API routes
    - Each route: one success example and one forced-failure example asserting error status + code (no fabricated data)
    - Translate route: provider selection end-to-end and per-language cache reuse
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 6.8_

- [x] 11. Implement the honest-labeling and safety components
  - [x] 11.1 Implement `components/DataSourceBadge.tsx`
    - Render data source + last-updated time for any data view; accessible text (not color alone)
    - _Requirements: 9.1_
  - [x] 11.2 Implement `components/SimulatedBadge.tsx`
    - Render a "Simulated" badge for simulated layers only; text + icon, not color alone
    - _Requirements: 8.4, 9.2_
  - [x] 11.3 Implement `components/SafetyLines.tsx`
    - Render both `Fixed_Safety_Lines` from resolved copy; no medical or evacuation-timing content
    - _Requirements: 5.4, 9.5_
  - [x]* 11.4 Write unit tests for the labeling and safety components
    - Badge renders source + last-updated; simulated badge present only when simulated; both safety lines render
    - _Requirements: 8.4, 9.1, 9.2, 9.5_

- [x] 12. Implement the resident interaction components
  - [x] 12.1 Implement `components/LanguagePicker.tsx`
    - Offer each of the six `Supported_Languages`; accessible name; associated label
    - _Requirements: 6.1, 10.3_
  - [x] 12.2 Implement `components/OutagePlanCard.tsx`
    - Render device types, battery hours, battery timeline (via `formatBatteryTimeline`, labeled), contacts, steps-before-storm, verified help numbers, and both safety lines via `SafetyLines`
    - Render `SmallCount.label` as "11 or fewer" where masked; no medical/evacuation advice
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 9.4, 9.5_
  - [x]* 12.3 Write unit tests for the resident components
    - Language picker options; card completeness; label present on timeline; small-count label; no forbidden advice
    - _Requirements: 5.2, 5.3, 5.4, 6.1, 9.4_

- [x] 13. Implement the planner map and ranked-list components
  - [x] 13.1 Implement `components/RankedList.tsx`
    - Build `ScoringInputs` per ZIP, call `outreachPriority(inputs, buildScoringConfig(dataset), knownZips)` then `rankByPriority`
    - Each row shows the score and the contributing reasons; serves as the non-map data path
    - _Requirements: 7.4, 7.5, 7.6, 10.2_
  - [x] 13.2 Implement `components/CountyChoropleth.tsx`
    - Leaflet map rendered client-only (consumed via `dynamic(..., { ssr: false })`); color 14 counties from `public/ma-counties.geojson` by `aggregateCountyDependents`
    - Overlay active alerts via `mapAlertsToZips` / per-county highest `compareSeverity`; county click selects and filters the ranked list; accessible names on map controls
    - _Requirements: 7.1, 7.2, 7.3, 10.3_
  - [x]* 13.3 Write unit tests for the planner components
    - Ranked row shows score + reasons; county selection filters the ranked list to that county's ZIPs
    - _Requirements: 7.3, 7.6_

- [x] 14. Checkpoint - Ensure all component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implement the landing page
  - [x] 15.1 Implement `app/page.tsx`
    - Server component describing who PowerPlan is for; controls navigating to `/plan` and `/planner`; visible focus, accessible names
    - _Requirements: 3.1, 3.2, 3.3, 10.3, 10.4_
  - [x]* 15.2 Write unit tests for the landing page
    - Description present; both navigation controls route to `/plan` and `/planner`
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 16. Implement the resident page
  - [x] 16.1 Implement `app/plan/page.tsx`
    - Client page: form (ZIP, device types, battery hours with `>= 0` validation, up to 3 contacts) wired to `usePlanStorage`
    - Fetch alerts/empower with ZIP only; render `OutagePlanCard`; `LanguagePicker` → `/api/translate` → resolved copy; `DataSourceBadge` on data views
    - Share via `navigator.share` when present, else copy-to-clipboard + print, using `buildShareText`; print `@media print` stylesheet
    - With no AI key, English templates render everywhere without error
    - _Requirements: 4.1, 4.2, 4.4, 4.6, 5.1, 5.6, 5.7, 5.8, 5.9, 6.3, 6.9, 9.1_
  - [x]* 16.2 Write unit/integration tests for the resident page
    - Max-3-contacts cap; negative battery-hours prompt; alerts shown for ZIP; share branches (native vs fallback); no-AI-key renders English without error
    - _Requirements: 4.2, 4.6, 5.1, 5.7, 5.8, 6.9_

- [x] 17. Implement the planner page
  - [x] 17.1 Implement `app/planner/page.tsx`
    - Desktop dashboard: fetch `/api/empower` + `/api/alerts`; load `CountyChoropleth` via `dynamic(..., { ssr: false })`; render `RankedList` alongside
    - Storm Scenario toggle: off = live base layer only; on = add `/api/outages` layer with `SimulatedBadge`, set `hasActiveOutage` via `outageFlagsByZip` before scoring
    - `DataSourceBadge` on every view; emPOWER labeled aggregated/de-identified Medicare; `SmallCount.label` "11 or fewer"
    - _Requirements: 7.2, 7.3, 8.1, 8.2, 8.3, 8.4, 9.1, 9.3, 9.4_
  - [x]* 17.2 Write unit/integration tests for the planner page
    - Storm Scenario off shows live only; on adds simulated layer + badge and flags active-outage ZIPs; emPOWER labeled aggregated/de-identified
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.3_

- [x] 18. Accessibility verification and reduced motion
  - [x] 18.1 Apply reduced-motion and focus-visibility cross-cutting styles
    - Honor `prefers-reduced-motion` in `app/globals.css`; ensure visible focus indicators on all interactive controls; 44x44px tap targets; skip-to-content link
    - Ensure no essential information is conveyed through animation alone
    - _Requirements: 10.3, 10.4, 10.6_
  - [x]* 18.2 Write axe tests for `/plan` and `/planner`
    - Run automated axe checks on both pages and assert no violations
    - _Requirements: 10.1, 10.5_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Checkpoints ensure incremental validation after each major group.
- Property tests (fast-check, >= 100 iterations) cover ONLY the twelve new pure helpers; the engine's own logic is already property-tested and is not re-tested here.
- Component, route, and page behavior is covered by example/integration tests; axe runs on both main pages.
- The design uses TypeScript throughout, so no language selection was needed.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.3", "3.1", "4.1", "4.3", "6.1", "6.3", "8.1", "8.3", "8.5"] },
    { "id": 2, "tasks": ["2.2", "2.4", "3.2", "3.3", "4.2", "4.4", "6.2", "6.4", "8.2", "8.4", "8.6", "7.1"] },
    { "id": 3, "tasks": ["6.5", "7.2", "7.3", "10.1", "10.2", "10.3", "10.4"] },
    { "id": 4, "tasks": ["10.5", "11.1", "11.2", "11.3", "13.1"] },
    { "id": 5, "tasks": ["11.4", "12.1", "12.2", "13.2"] },
    { "id": 6, "tasks": ["12.3", "13.3", "15.1"] },
    { "id": 7, "tasks": ["15.2", "16.1", "17.1"] },
    { "id": 8, "tasks": ["16.2", "17.2", "18.1"] },
    { "id": 9, "tasks": ["18.2"] }
  ]
}
```
