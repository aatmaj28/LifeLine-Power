// Public surface for the PowerPlan Risk Engine.
//
// This barrel re-exports the engine's supported API from its sibling modules:
// shared types, the three loaders (emPOWER CSV, NWS alerts, simulated outages),
// and the pure scoring and battery-timeline cores. Consumers should import from
// `lib/risk-engine` rather than reaching into individual module files.
//
// Type-only names use `export type { ... }` and runtime values use
// `export { ... }` so the project's strict `isolatedModules` / bundler
// resolution can erase types cleanly. Internal test-only helpers (e.g.
// `__resetAlertCache`) are intentionally NOT re-exported here.

// --- Shared types and labels ------------------------------------------------
export type {
  DataSource,
  SmallCount,
  Severity,
  Result,
  EngineError,
} from "./types";
export { makeSmallCount } from "./types";

// --- emPOWER CSV loader -----------------------------------------------------
export type {
  EmpowerZipRecord,
  EmpowerCountyRecord,
  EmpowerMonthlyRecord,
  EmpowerDataset,
} from "./empower-loader";
export {
  parseZipCsv,
  parseCountyCsv,
  parseMonthlyCsv,
  loadEmpowerDataset,
} from "./empower-loader";

// --- NWS alert loader -------------------------------------------------------
export type { NwsAlert, ZipAlert } from "./alert-loader";
export {
  SEVERITY_ORDER,
  compareSeverity,
  parseNwsResponse,
  mapAlertsToZips,
  fetchActiveAlerts,
} from "./alert-loader";

// --- Simulated-outage loader ------------------------------------------------
export type { SimulatedOutage } from "./outage-loader";
export { validateOutages, loadSimulatedOutages } from "./outage-loader";

// --- Scoring core -----------------------------------------------------------
export type {
  Reason,
  ScoreResult,
  ScoringInputs,
  ScoringConfig,
} from "./scoring";
export { outreachPriority, rankByPriority } from "./scoring";

// --- Battery-timeline core --------------------------------------------------
export type { Timeline } from "./battery";
export { batteryTimeline } from "./battery";
