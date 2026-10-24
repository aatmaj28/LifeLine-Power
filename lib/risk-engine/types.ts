// Shared types and labels for the PowerPlan Risk Engine.
//
// Honesty is encoded in the type system: every record carries a `dataSource`
// label, and simulated records carry `simulated: true`. All boundaries return
// `Result<T>` rather than throwing, so callers must handle failure explicitly.

/**
 * Provenance label applied to every value the engine exposes. emPOWER figures
 * are aggregated, de-identified Medicare data; NWS alerts are live; anything
 * synthetic is explicitly simulated.
 */
export type DataSource =
  | "empower-aggregated-deidentified-medicare"
  | "nws-live-alert"
  | "simulated";

/**
 * A count that the source may have masked for small-cell privacy. emPOWER
 * reports a value of 11 to mean "11 or fewer".
 */
export interface SmallCount {
  /** Raw numeric value. */
  value: number;
  /** True when the source masked the count. */
  masked: boolean;
  /** Human-readable label, e.g. "11 or fewer" when masked, otherwise String(value). */
  label: string;
}

/**
 * National Weather Service alert severity, ordered none < Minor < Moderate <
 * Severe < Extreme.
 */
export type Severity = "none" | "Minor" | "Moderate" | "Severe" | "Extreme";

/**
 * Discriminated result type used by all loaders and scoring (no throwing across
 * boundaries).
 */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: EngineError };

/**
 * Error carried by failed `Result`s. `code` identifies the failure class and
 * `field` names the offending column/field when applicable.
 */
export interface EngineError {
  code:
    | "MISSING_COLUMN"
    | "PARSE_ERROR"
    | "SCHEMA_ERROR"
    | "UNKNOWN_ZIP"
    | "NEGATIVE_DURATION"
    | "FETCH_FAILED"
    | "UNPARSEABLE_RESPONSE";
  /** The offending column/field when applicable. */
  field?: string;
  message: string;
}

/**
 * Build a {@link SmallCount} from a raw numeric value. A value of 11 is treated
 * as masked ("11 or fewer"), matching emPOWER's small-cell suppression.
 */
export function makeSmallCount(n: number): SmallCount {
  const masked = n === 11;
  return {
    value: n,
    masked,
    label: masked ? "11 or fewer" : String(n),
  };
}
