# Design Document

## Overview

The Risk Engine is the data-and-logic layer for PowerPlan. It is implemented as a set of library-style TypeScript modules (no UI) that live under `lib/risk-engine/` in a Next.js App Router + TypeScript + Tailwind project. The engine:

1. Parses three HHS emPOWER CSV datasets into typed, validated records (emPOWER_Loader).
2. Fetches and maps live National Weather Service active alerts for Massachusetts (Alert_Loader).
3. Reads and validates a simulated-outage file (Outage_Loader).
4. Computes an explainable, weighted outreach-priority score per ZIP (`outreachPriority`), produces a stable ranking, and computes a pure battery-runtime timeline (`batteryTimeline`).

Design priorities, in order: **honesty** (every value is traceable to a source and labeled; nothing is fabricated), **correctness** (pure functions with provable invariants, verified by property-based tests), and **testability** (deterministic cores separated from I/O so fast-check arbitraries can drive them directly).

The scoring and timeline cores are pure functions. All non-determinism (network, filesystem, clock) is pushed to the edges (loaders) so the logic under property test takes plain data in and returns plain data out.

## Architecture

```
                         ┌─────────────────────────────────────────┐
                         │              Risk Engine                 │
                         │            (lib/risk-engine/)             │
                         │                                          │
  CSV files ───────────▶ │  emPOWER_Loader ─┐                       │
  (data/*.csv)           │                  │                       │
                         │  Alert_Loader ───┼─▶  Dataset (typed)    │
  api.weather.gov ─────▶ │   (+ cache)      │        │              │
                         │                  │        ▼              │
  sim-outages.json ────▶ │  Outage_Loader ──┘   scoring (pure) ─────┼──▶ ScoreResult / Ranking
                         │                           │              │
  user input ──────────────────────────────────────▶ batteryTimeline (pure) ─▶ Timeline
                         └─────────────────────────────────────────┘
```

Module layout:

- `lib/risk-engine/types.ts` — shared types (records, enums, result/error shapes, data-source and simulated labels).
- `lib/risk-engine/empower-loader.ts` — CSV parsing and validation.
- `lib/risk-engine/alert-loader.ts` — NWS fetch, cache, SAME→FIPS→ZIP mapping, severity ordering.
- `lib/risk-engine/outage-loader.ts` — simulated-outage file read and schema validation.
- `lib/risk-engine/scoring.ts` — `outreachPriority`, `rankByPriority`, severity weights, normalization (pure).
- `lib/risk-engine/battery.ts` — `batteryTimeline` (pure).
- `lib/risk-engine/index.ts` — public surface.

Tests live alongside under `lib/risk-engine/__tests__/` using Vitest + fast-check.

### Separation of I/O and logic (why)

The loaders perform effects and return typed, in-memory data. The scoring and timeline functions never touch the network, filesystem, or clock — `outreachPriority` and `batteryTimeline` take all inputs as parameters. This keeps the invariants (monotonicity, non-negativity, stable ranking, depletion ≥ start) expressible as universally quantified properties that fast-check can exercise directly without mocking I/O.

## Components and Interfaces

### Shared types and labels

Honesty is encoded in the type system: every record carries a `dataSource` label, and simulated records carry `simulated: true`.

```typescript
export type DataSource = "empower-aggregated-deidentified-medicare" | "nws-live-alert" | "simulated";

export interface SmallCount {
  value: number;         // raw numeric value
  masked: boolean;       // true when the source masked the count
  label: string;         // e.g. "11 or fewer" when masked, otherwise String(value)
}

export type Severity = "none" | "Minor" | "Moderate" | "Severe" | "Extreme";

// Discriminated result type used by all loaders and scoring (no throwing across boundaries).
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: EngineError };

export interface EngineError {
  code:
    | "MISSING_COLUMN"
    | "PARSE_ERROR"
    | "SCHEMA_ERROR"
    | "UNKNOWN_ZIP"
    | "NEGATIVE_DURATION"
    | "FETCH_FAILED"
    | "UNPARSEABLE_RESPONSE";
  field?: string;        // the offending column/field when applicable
  message: string;
}
```

### emPOWER_Loader

Parses the three CSVs into typed records. ZIPs are kept as strings so leading zeros survive (`"02360"`), `power_dependent_dme` is the primary count and is wrapped in `SmallCount` so a value of `11` is surfaced as "11 or fewer". Malformed rows are rejected per-record with a field-identifying error.

```typescript
export interface EmpowerZipRecord {
  zip: string;                    // 5-char text, leading zeros preserved
  county: string;
  countyFips: string;             // 5-char text
  medicareBenes: number;
  powerDependentDme: SmallCount;  // PRIMARY dependent count
  esrdDialysisAnyDme: number;
  o2ServicesAnyDme: number;
  homeHealthAnyDme: number;
  hospiceAnyDme: number;
  healthcareSrvcAnyDme: number;
  pctPowerDependent: number;
  dataSource: "empower-aggregated-deidentified-medicare";
}

export interface EmpowerCountyRecord {
  countyFips: string;
  county: string;
  medicareBenes: number;
  powerDependentDme: SmallCount;
  esrdDialysisAnyDme: number;
  o2ServicesAnyDme: number;
  homeHealthAnyDme: number;
  hospiceAnyDme: number;
  healthcareSrvcAnyDme: number;
  pctPowerDependent: number;
  dataSource: "empower-aggregated-deidentified-medicare";
}

export interface EmpowerMonthlyRecord {
  zip: string;
  county: string;
  month: string;                  // e.g. "2026-10"
  medicareBenes: number;
  powerDependentDme: SmallCount;
  dataSource: "empower-aggregated-deidentified-medicare";
}

export interface EmpowerDataset {
  zip: EmpowerZipRecord[];
  county: EmpowerCountyRecord[];
  monthly: EmpowerMonthlyRecord[];
  zipByCode: Map<string, EmpowerZipRecord>;      // index for lookup
  zipsByCountyFips: Map<string, EmpowerZipRecord[]>; // index for alert fan-out
}

// Pure parse functions over already-read text (property-testable, no filesystem).
export function parseZipCsv(text: string): Result<EmpowerZipRecord[]>;
export function parseCountyCsv(text: string): Result<EmpowerCountyRecord[]>;
export function parseMonthlyCsv(text: string): Result<EmpowerMonthlyRecord[]>;

// Thin I/O wrapper that reads the three files from data/ and builds indices.
export function loadEmpowerDataset(dir?: string): Promise<Result<EmpowerDataset>>;
```

Parsing rules:

- Required columns (from the CSV headers: zip, county, county_fips, medicare_benes, power_dependent_dme, esrd_dialysis_any_dme, o2_services_any_dme, home_health_any_dme, hospice_any_dme, healthcare_srvc_any_dme, pct_power_dependent for ZIP; county variant drops `zip`; monthly has zip, county, month, medicare_benes, power_dependent_dme). A missing required column → `MISSING_COLUMN` with the column name.
- Numeric fields that fail to parse as a finite number → `PARSE_ERROR` with the field name. The affected record is rejected, not silently defaulted.
- ZIP and county_fips are never coerced to numbers; they remain text.
- `makeSmallCount(n)`: `masked = n === 11`, `label = masked ? "11 or fewer" : String(n)`.

### Alert_Loader

Fetches MA active alerts, caches for ~5 minutes, maps each alert's SAME code to a county FIPS and fans out to every ZIP in that county.

```typescript
export interface NwsAlert {
  id: string;
  severity: Severity;
  sameCodes: string[];     // 6-digit SAME codes from alert geocode.SAME
  countyFips: string[];    // last 5 digits of each SAME code
  headline?: string;
  dataSource: "nws-live-alert";
}

export interface ZipAlert {
  zip: string;
  severity: Severity;      // highest severity affecting the ZIP
  alertIds: string[];
  dataSource: "nws-live-alert";
}

const SEVERITY_ORDER: Record<Severity, number> = {
  none: 0, Minor: 1, Moderate: 2, Severe: 3, Extreme: 4,
};
export function compareSeverity(a: Severity, b: Severity): number; // by SEVERITY_ORDER

// Pure mapping: given parsed alerts and the ZIP index, produce per-ZIP alerts.
export function mapAlertsToZips(
  alerts: NwsAlert[],
  zipsByCountyFips: Map<string, EmpowerZipRecord[]>
): ZipAlert[];

// Pure parse of a raw NWS GeoJSON body into NwsAlert[]; unparseable → UNPARSEABLE_RESPONSE.
export function parseNwsResponse(body: unknown): Result<NwsAlert[]>;

// I/O + cache wrapper.
export function fetchActiveAlerts(opts?: { now?: number }): Promise<Result<NwsAlert[]>>;
```

Behavior:

- Endpoint: `https://api.weather.gov/alerts/active?area=MA`.
- Sends a descriptive `User-Agent` header (e.g. `PowerPlan/1.0 (contact@powerplan.example)`) as NWS requires.
- In-memory cache: stores `{ fetchedAt, value }`; a request within 5 minutes (300_000 ms) of `fetchedAt` returns the cached value. `now` is injectable for testing.
- SAME → FIPS: `countyFips = sameCode.slice(1)` (SAME is 6 digits; the trailing 5 are the FIPS).
- Fan-out: for each alert FIPS, append the alert to every ZIP in `zipsByCountyFips.get(fips)`. A ZIP covered by multiple alerts keeps the highest severity via `compareSeverity`.
- Failure: a failed request → `FETCH_FAILED`; an unparseable body → `UNPARSEABLE_RESPONSE`. No fabricated alerts are ever emitted.

### Outage_Loader

Reads and validates `data/sim-outages.json`; every accepted record is labeled simulated.

```typescript
export interface SimulatedOutage {
  zip?: string;
  county?: string;           // county name or FIPS; at least one of zip/county required
  active: boolean;
  start: string;             // ISO timestamp
  estimatedRestore?: string; // optional ISO timestamp
  simulated: true;           // always true
  dataSource: "simulated";
}

// Pure validation over already-parsed JSON (property-testable).
export function validateOutages(data: unknown): Result<SimulatedOutage[]>;

// I/O wrapper that reads data/sim-outages.json.
export function loadSimulatedOutages(path?: string): Promise<Result<SimulatedOutage[]>>;
```

Schema rules: input must be an array; each element must have a boolean `active`, a `start` field, and at least one of `zip`/`county`; `estimatedRestore` is optional. The first non-conforming record → `SCHEMA_ERROR` with the offending field name. Every accepted record is stamped `simulated: true` and `dataSource: "simulated"`.

### Scoring (`outreachPriority`, `rankByPriority`)

Pure, explainable, weighted-additive scoring. The dependent-count contribution is normalized by a **fixed dataset maximum** (not a per-call maximum) so that increasing one ZIP's dependent count can never change another ZIP's normalization — this is what makes monotonicity hold.

```typescript
export interface Reason {
  signal: "dependents" | "severity" | "outage";
  label: string;        // human-readable, e.g. "444 power-dependent (normalized 0.62)"
  value: number;        // non-negative contribution to the score
}

export interface ScoreResult {
  zip: string;
  score: number;        // sum of reason.value, non-negative
  reasons: Reason[];
  dataSources: DataSource[]; // every source that fed this score
}

export interface ScoringInputs {
  zip: string;
  powerDependentDme: number;  // raw dependent count for the ZIP
  severity: Severity;         // highest severity affecting the ZIP (none if no alert)
  hasActiveOutage: boolean;   // active NWS alert or active simulated outage
}

export interface ScoringConfig {
  dependentMax: number;         // FIXED dataset max used for normalization (> 0)
  dependentWeight: number;      // >= 0
  severityWeight: Record<Severity, number>; // strictly increasing none→Extreme, all >= 0
  outageBonus: number;          // >= 0
}

export function outreachPriority(
  inputs: ScoringInputs,
  config: ScoringConfig,
  knownZips: ReadonlySet<string>
): Result<ScoreResult>;

export function rankByPriority(
  results: ScoreResult[]
): ScoreResult[]; // sorted desc by score, tiebreak zip ascending
```

Scoring formula (all terms ≥ 0):

```
normalizedDependents = clamp(powerDependentDme / config.dependentMax, 0, 1)   // fixed max
dependentContribution = config.dependentWeight * normalizedDependents
severityContribution  = config.severityWeight[severity]                        // strictly increasing
outageContribution    = hasActiveOutage ? config.outageBonus : 0

score = dependentContribution + severityContribution + outageContribution
```

Key decisions:

- **Fixed normalization denominator.** `dependentMax` is computed once from the loaded dataset (the dataset-wide max `power_dependent_dme`) and passed in as config. Because it does not depend on the ZIP being scored, raising one ZIP's dependents only raises that ZIP's contribution — monotonicity (Req 4.6, 4.7) is preserved. A per-call max over the current input set would break this, so it is explicitly avoided.
- **Strictly increasing severity weights.** The default `severityWeight` is strictly increasing across `none < Minor < Moderate < Severe < Extreme`, so a higher severity never lowers the score.
- **Non-negative reasons.** Each contribution becomes a `Reason` with a non-negative `value`; `score` is their sum and therefore non-negative.
- **Unknown ZIP rejection.** If `zip` is not in `knownZips`, return `{ ok: false, error: { code: "UNKNOWN_ZIP", field: "zip" } }` and never a score.
- **Stable ranking.** `rankByPriority` sorts by `score` descending with a deterministic tiebreaker of `zip` ascending. Since the comparator is a total order over `(score, zip)` and ZIPs are unique, the output is a function of the set only — independent of input order (Req 5.2).

### `batteryTimeline`

Pure arithmetic: depletion = start + batteryHours, clamped to never precede start.

```typescript
export interface Timeline {
  start: number;        // epoch ms (outage start)
  batteryHours: number;
  depletion: number;    // epoch ms, >= start
}

export function batteryTimeline(
  batteryHours: number,
  outageStart: number    // epoch ms
): Result<Timeline>;
```

Behavior:

- Negative `batteryHours` → `{ ok: false, error: { code: "NEGATIVE_DURATION", field: "batteryHours" } }`; no depletion time returned (Req 6.4).
- Otherwise `depletion = outageStart + batteryHours * 3_600_000`. Since `batteryHours >= 0`, `depletion >= outageStart` (Req 6.2).
- Monotonic: for fixed `outageStart`, `depletion` is non-decreasing in `batteryHours` (Req 6.3).

## Data Models

| Entity | Key fields | Source label |
|---|---|---|
| EmpowerZipRecord | zip (text), countyFips (text), powerDependentDme (SmallCount) | aggregated de-identified Medicare |
| EmpowerCountyRecord | countyFips, powerDependentDme (SmallCount) | aggregated de-identified Medicare |
| EmpowerMonthlyRecord | zip, month, powerDependentDme (SmallCount) | aggregated de-identified Medicare |
| NwsAlert / ZipAlert | severity, countyFips / zip | nws-live-alert |
| SimulatedOutage | zip?/county?, active, start | simulated |
| ScoreResult | zip, score, reasons[], dataSources[] | inherited from inputs |
| Timeline | start, batteryHours, depletion | user-supplied |

Indexing: `EmpowerDataset` builds `zipByCode` for O(1) ZIP lookup and `zipsByCountyFips` for O(1) alert fan-out. `dependentMax` for scoring config is derived once as the max `powerDependentDme.value` across the ZIP dataset.

## Error Handling

All boundaries return `Result<T>` rather than throwing, so callers must handle failure explicitly and errors carry a `code` and (where relevant) a `field`:

- emPOWER_Loader: `MISSING_COLUMN` (field = column), `PARSE_ERROR` (field = numeric column). Bad records are rejected individually.
- Alert_Loader: `FETCH_FAILED`, `UNPARSEABLE_RESPONSE`. Never emits fabricated alerts.
- Outage_Loader: `SCHEMA_ERROR` (field = invalid/missing field).
- Scoring: `UNKNOWN_ZIP` (never returns a score for an unknown ZIP).
- batteryTimeline: `NEGATIVE_DURATION` (never returns a depletion time).

Honesty invariant: the engine only exposes values present in loaded datasets, live alerts, or user inputs; failure paths return errors instead of placeholder/fabricated data.

## Testing Strategy

Vitest is the runner; fast-check provides property generation. Each property test runs a minimum of 100 iterations and is tagged `Feature: risk-engine, Property {n}: {property text}`. Pure cores (`parse*`, `validateOutages`, `mapAlertsToZips`, `outreachPriority`, `rankByPriority`, `batteryTimeline`) are tested directly; I/O wrappers get a small number of example/integration tests.

Arbitraries (fast-check generators):

- `arbZip`: 5-char numeric strings with leading zeros preserved (`fc.stringMatching(/^\d{5}$/)` or 5-digit zero-padded integers).
- `arbSeverity`: `fc.constantFrom("none","Minor","Moderate","Severe","Extreme")`.
- `arbScoringInputs`: record of zip, non-negative `powerDependentDme`, severity, `hasActiveOutage` boolean.
- `arbScoringConfig`: positive `dependentMax`, non-negative weights, strictly-increasing `severityWeight` map, non-negative `outageBonus`.
- `arbBatteryHours`: non-negative floats (with a separate negative generator for the rejection property).
- `arbEpochMs`: integer timestamps.
- `arbZipSet` / `arbScoreResults`: sets of distinct ZIPs with scores for ranking tests.

Unit/example tests cover: leading-zero ZIP preservation, the `11 → "11 or fewer"` label, SAME→FIPS slicing, cache hit within 5 minutes, and schema rejection messages.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — a formal statement about what the system should do. Properties bridge human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Dependent count is non-decreasing in score

*For any* two `ScoringInputs` that are identical except that the second has a `powerDependentDme` greater than or equal to the first, and any valid `ScoringConfig` and known-ZIP set containing the ZIP, `outreachPriority` returns a score for the second that is greater than or equal to the score for the first.

Function under test: `outreachPriority` (with fixed `dependentMax` normalization).

**Validates: Requirements 4.6, 7.2**

### Property 2: Severity is non-decreasing in score

*For any* two `ScoringInputs` that are identical except for `severity`, and any valid `ScoringConfig` with strictly-increasing severity weights, `outreachPriority` returns a score for the higher-severity input that is greater than or equal to the score for the lower-severity input.

Function under test: `outreachPriority`.

**Validates: Requirements 4.3, 4.6, 7.3**

### Property 3: Zero dependents never outscores greater dependents

*For any* two otherwise-identical `ScoringInputs` where one has `powerDependentDme = 0` and the other has `powerDependentDme > 0`, `outreachPriority` returns a score for the zero-dependent ZIP that is less than or equal to the score for the greater-dependent ZIP.

Function under test: `outreachPriority`.

**Validates: Requirements 4.7, 7.4**

### Property 4: Adding an active outage never lowers the score

*For any* `ScoringInputs` and valid `ScoringConfig`, the score with `hasActiveOutage = true` is greater than or equal to the score with `hasActiveOutage = false` when all other signals are held constant; and every returned `Reason` has a non-negative `value`.

Function under test: `outreachPriority`.

**Validates: Requirements 4.4, 4.5, 7.5**

### Property 5: Ranking is stable under input reordering

*For any* set of `ScoreResult` values with distinct ZIPs, `rankByPriority` applied to any permutation of that set produces the same ordered output (sorted by score descending, ties broken by ZIP ascending).

Function under test: `rankByPriority`.

**Validates: Requirements 5.1, 5.2, 7.6**

### Property 6: Battery depletion is never before start and is monotonic in hours

*For any* non-negative `batteryHours` and any `outageStart`, `batteryTimeline` returns a `depletion` that is greater than or equal to `outageStart`; and *for any* two non-negative durations `h1 <= h2` with the same `outageStart`, the depletion for `h1` is less than or equal to the depletion for `h2`.

Function under test: `batteryTimeline`.

**Validates: Requirements 6.2, 6.3, 7.7**

### Property 7: Invalid inputs are rejected, never silently scored

*For any* ZIP absent from the known-ZIP set, `outreachPriority` returns an error result (`UNKNOWN_ZIP`) and no score; and *for any* negative `batteryHours`, `batteryTimeline` returns an error result (`NEGATIVE_DURATION`) and no depletion time.

Functions under test: `outreachPriority`, `batteryTimeline`.

**Validates: Requirements 4.8, 6.4, 7.8**
