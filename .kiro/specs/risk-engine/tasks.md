# Implementation Plan: Risk Engine

## Overview

Build the PowerPlan Risk Engine as library-style TypeScript modules under `lib/risk-engine/` in a greenfield Next.js App Router + TypeScript + Tailwind project. Work proceeds from project scaffolding and test setup, to shared types, to the three loaders (emPOWER CSV, NWS alerts, simulated outages), to the pure scoring and battery cores, and finally the public surface. Pure functions are implemented and property-tested alongside each module so the seven correctness-property invariants from the design are verified as they land. All non-determinism (network, filesystem, clock) stays at the loader edges so the scoring and timeline cores remain directly property-testable.

## Tasks

- [x] 1. Scaffold Next.js + TypeScript + Tailwind project and test tooling
  - [x] 1.1 Initialize the Next.js App Router + TypeScript + Tailwind project
    - Create `package.json`, `tsconfig.json`, `next.config.*`, Tailwind config (`tailwind.config.*`, `postcss.config.*`), and the App Router `app/` entry (`app/layout.tsx`, `app/globals.css`) at the workspace root
    - Preserve the existing `data/` directory and its CSV files untouched
    - Add a `test` script that runs Vitest in single-run mode (`vitest run`)
    - _Requirements: 7.1_

  - [x] 1.2 Configure Vitest + fast-check
    - Add `vitest` and `fast-check` as dev dependencies and create `vitest.config.ts`
    - Configure the test include glob to pick up `lib/risk-engine/__tests__/**/*.test.ts`
    - Add a trivial smoke test under `lib/risk-engine/__tests__/` that imports `fast-check` and asserts a single property runs, to confirm the runner and generator wiring
    - _Requirements: 7.1_

- [x] 2. Define shared types and labels
  - [x] 2.1 Create `lib/risk-engine/types.ts`
    - Define `DataSource`, `SmallCount`, `Severity`, `Result<T>`, and `EngineError` with the full `code` union from the design
    - Export `makeSmallCount(n)` helper: `masked = n === 11`, `label = masked ? "11 or fewer" : String(n)`
    - _Requirements: 1.5, 1.6, 8.1, 8.2, 8.3_

  - [x] 2.2 Write unit tests for `makeSmallCount`
    - Assert `11` yields `masked: true` and label `"11 or fewer"`, and other values yield `masked: false` with `String(n)` label
    - _Requirements: 1.6_

- [x] 3. Implement emPOWER CSV loader
  - [x] 3.1 Implement pure CSV parsers in `lib/risk-engine/empower-loader.ts`
    - Define `EmpowerZipRecord`, `EmpowerCountyRecord`, `EmpowerMonthlyRecord`, and `EmpowerDataset`
    - Implement `parseZipCsv`, `parseCountyCsv`, `parseMonthlyCsv` over already-read text returning `Result<...[]>`
    - Enforce required columns (per design header lists); missing column → `MISSING_COLUMN` with the column name
    - Reject per-record on unparseable numeric field → `PARSE_ERROR` with the field name; never silently default
    - Keep `zip` and `county_fips` as text (leading zeros preserved); wrap `power_dependent_dme` via `makeSmallCount`
    - Stamp `dataSource: "empower-aggregated-deidentified-medicare"` on every record
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 8.1_

  - [x] 3.2 Implement `loadEmpowerDataset` I/O wrapper and indices
    - Read the three CSVs from `data/` (default dir), call the pure parsers, and build `zipByCode` and `zipsByCountyFips` indices
    - Return `Result<EmpowerDataset>`, propagating parser errors
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 3.3 Write unit tests for the CSV parsers
    - Cover leading-zero ZIP preservation (e.g. `"02360"`), the `11 → "11 or fewer"` label surfaced through parsing, `MISSING_COLUMN` on a dropped required column, and `PARSE_ERROR` on a non-numeric numeric field
    - _Requirements: 1.4, 1.6, 1.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement NWS alert loader
  - [x] 5.1 Implement alert types, severity ordering, and pure mapping in `lib/risk-engine/alert-loader.ts`
    - Define `NwsAlert`, `ZipAlert`, `SEVERITY_ORDER`, and `compareSeverity`
    - Implement `parseNwsResponse(body)` → `Result<NwsAlert[]>`; derive `countyFips = sameCode.slice(1)` from each 6-digit SAME code; unparseable body → `UNPARSEABLE_RESPONSE`
    - Implement `mapAlertsToZips(alerts, zipsByCountyFips)`: fan out each alert FIPS to every ZIP in that county, keeping the highest severity per ZIP via `compareSeverity`
    - Stamp `dataSource: "nws-live-alert"`
    - _Requirements: 2.4, 2.5, 2.6, 2.7, 8.3_

  - [x] 5.2 Implement `fetchActiveAlerts` with User-Agent and 5-minute cache
    - Fetch `https://api.weather.gov/alerts/active?area=MA` with a descriptive `User-Agent` header
    - Maintain an in-memory `{ fetchedAt, value }` cache; serve from cache within 300_000 ms of `fetchedAt`; accept an injectable `now` for testing
    - Failed request → `FETCH_FAILED`; never emit fabricated alerts
    - _Requirements: 2.1, 2.2, 2.3, 2.7, 8.3_

  - [x] 5.3 Write unit tests for alert mapping and cache
    - Cover SAME→FIPS slicing, fan-out to all ZIPs in a county, highest-severity retention for multi-alert ZIPs, a cache hit within 5 minutes (via injected `now`), and `UNPARSEABLE_RESPONSE` on a bad body
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 6. Implement simulated-outage loader and data file
  - [x] 6.1 Create `data/sim-outages.json`
    - Author a small array of simulated-outage records conforming to the schema (each with `active`, `start`, and at least one of `zip`/`county`; some with optional `estimatedRestore`) using ZIPs/counties present in the emPOWER dataset
    - _Requirements: 3.1, 3.2_

  - [x] 6.2 Implement `validateOutages` and `loadSimulatedOutages` in `lib/risk-engine/outage-loader.ts`
    - Define `SimulatedOutage`; implement pure `validateOutages(data)` → `Result<SimulatedOutage[]>`
    - Enforce: input is an array; each element has boolean `active`, a `start`, and at least one of `zip`/`county`; `estimatedRestore` optional; first non-conforming record → `SCHEMA_ERROR` with the offending field name
    - Stamp every accepted record `simulated: true` and `dataSource: "simulated"`
    - Implement `loadSimulatedOutages(path?)` reading `data/sim-outages.json` and delegating to `validateOutages`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.2_

  - [x] 6.3 Write unit tests for outage validation
    - Cover acceptance of a valid array, `SCHEMA_ERROR` with the field name on a record missing `active`/`start`/both of `zip`/`county`, and the `simulated: true` / `dataSource: "simulated"` stamping
    - _Requirements: 3.3, 3.4, 3.5_

- [x] 7. Implement scoring core
  - [x] 7.1 Implement `outreachPriority` in `lib/risk-engine/scoring.ts`
    - Define `Reason`, `ScoreResult`, `ScoringInputs`, and `ScoringConfig`
    - Normalize dependents against the FIXED `config.dependentMax` (clamp 0..1); compute weighted-additive score = dependent + severity + outage contributions, all terms ≥ 0
    - Emit one labeled, non-negative `Reason` per contributing signal and populate `dataSources`
    - Reject a ZIP absent from `knownZips` → `UNKNOWN_ZIP` (field `"zip"`), never returning a score
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 7.2 Write property test: dependent count is non-decreasing in score
    - **Property 1: Dependent count is non-decreasing in score**
    - **Validates: Requirements 4.6, 7.2**

  - [x] 7.3 Write property test: severity is non-decreasing in score
    - **Property 2: Severity is non-decreasing in score**
    - **Validates: Requirements 4.3, 4.6, 7.3**

  - [x] 7.4 Write property test: zero dependents never outscores greater dependents
    - **Property 3: Zero dependents never outscores greater dependents**
    - **Validates: Requirements 4.7, 7.4**

  - [x] 7.5 Write property test: adding an active outage never lowers the score
    - **Property 4: Adding an active outage never lowers the score**
    - **Validates: Requirements 4.4, 4.5, 7.5**

  - [x] 7.6 Implement `rankByPriority` in `lib/risk-engine/scoring.ts`
    - Sort `ScoreResult[]` by `score` descending with a deterministic `zip`-ascending tiebreaker, producing an order that is a function of the set only
    - _Requirements: 5.1, 5.2_

  - [x] 7.7 Write property test: ranking is stable under input reordering
    - **Property 5: Ranking is stable under input reordering**
    - **Validates: Requirements 5.1, 5.2, 7.6**

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement battery-timeline core
  - [x] 9.1 Implement `batteryTimeline` in `lib/risk-engine/battery.ts`
    - Define `Timeline`; reject negative `batteryHours` → `NEGATIVE_DURATION` (field `"batteryHours"`), returning no depletion time
    - Otherwise `depletion = outageStart + batteryHours * 3_600_000` (≥ `outageStart` since hours ≥ 0)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 9.2 Write property test: depletion never before start and monotonic in hours
    - **Property 6: Battery depletion is never before start and is monotonic in hours**
    - **Validates: Requirements 6.2, 6.3, 7.7**

  - [x] 9.3 Write property test: invalid inputs rejected, never silently scored
    - **Property 7: Invalid inputs are rejected, never silently scored** (unknown ZIP → `outreachPriority` error; negative hours → `batteryTimeline` error)
    - **Validates: Requirements 4.8, 6.4, 7.8**

- [x] 10. Wire the public surface
  - [x] 10.1 Create `lib/risk-engine/index.ts`
    - Re-export the public API: types, loaders (`loadEmpowerDataset`, `fetchActiveAlerts`/`parseNwsResponse`/`mapAlertsToZips`/`compareSeverity`, `loadSimulatedOutages`/`validateOutages`), and the pure cores (`outreachPriority`, `rankByPriority`, `batteryTimeline`)
    - _Requirements: 4.1, 5.1, 6.1_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirements for traceability.
- Property tests use Vitest + fast-check, run a minimum of 100 iterations each, and are tagged `Feature: risk-engine, Property {n}: {property text}` per the design's testing strategy.
- All seven correctness properties from the design are covered: Property 1 (7.2), Property 2 (7.3), Property 3 (7.4), Property 4 (7.5), Property 5 (7.7), Property 6 (9.2), Property 7 (9.3).
- Loaders keep network/filesystem/clock at the edges so the scoring and timeline cores stay directly property-testable.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "3.1", "6.1", "7.1", "9.1"] },
    { "id": 4, "tasks": ["3.2", "5.1", "6.2", "7.2", "7.3", "7.4", "7.5", "7.6", "9.2", "9.3"] },
    { "id": 5, "tasks": ["3.3", "5.2", "6.3", "7.7"] },
    { "id": 6, "tasks": ["5.3"] },
    { "id": 7, "tasks": ["10.1"] }
  ]
}
```
