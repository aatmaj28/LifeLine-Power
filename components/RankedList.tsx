import type {
  EmpowerDataset,
  EmpowerZipRecord,
  Reason,
  ScoreResult,
  ScoringInputs,
  Severity,
} from "@/lib/risk-engine";
// Import the runtime scoring core from its pure module, NOT the barrel. The
// barrel re-exports server-only filesystem loaders (`node:fs`), so pulling
// runtime values through it would drag those into any client bundle that
// consumes this component (e.g. the planner page). `scoring.ts` is pure.
import { outreachPriority, rankByPriority } from "@/lib/risk-engine/scoring";
import { buildScoringConfig } from "@/lib/app/planner/scoring-config";

/**
 * Props for {@link RankedList}.
 *
 * This is the non-map path to the planner's outreach-priority data
 * (Requirements 7.4, 10.2): it reproduces the same ranking the County_Choropleth
 * visualizes, as an accessible table that needs no map interaction.
 *
 * `severityByZip` and `outageByZip` are driven by the planner page (live NWS
 * alerts and, in Storm_Scenario_Mode, simulated outages). When a ZIP is absent
 * from either map, the component defaults to `"none"` severity and no active
 * outage — never fabricating a signal.
 */
export interface RankedListProps {
  /** Loaded emPOWER dataset (from `/api/empower`). */
  dataset: EmpowerDataset;
  /** Highest NWS severity per ZIP; ZIPs not present default to `"none"`. */
  severityByZip?: Map<string, Severity>;
  /** Active-outage flag per ZIP; ZIPs not present default to `false`. */
  outageByZip?: Map<string, boolean>;
  /** Optional filter: only include ZIPs in this county (by `county_fips`). */
  countyFips?: string;
  /** Optional cap on the number of rows rendered (e.g. top 50). */
  limit?: number;
  className?: string;
}

/**
 * Score every ZIP in the dataset (optionally filtered to one county) and rank
 * the results by outreach priority.
 *
 * Builds a {@link ScoringInputs} per ZIP from the dataset's dependent count, the
 * supplied severity/outage maps, then calls `outreachPriority` with the
 * dataset-wide {@link buildScoringConfig}. Unknown-ZIP rejections are skipped so
 * the list never invents a score it cannot back with data. The surviving
 * results are ranked with `rankByPriority` (score descending, ties by ZIP).
 */
function buildRankedRows(
  dataset: EmpowerDataset,
  severityByZip: Map<string, Severity> | undefined,
  outageByZip: Map<string, boolean> | undefined,
  countyFips: string | undefined,
): Array<{ record: EmpowerZipRecord; result: ScoreResult }> {
  const config = buildScoringConfig(dataset);
  const knownZips = new Set(dataset.zip.map((record) => record.zip));

  const records = countyFips
    ? dataset.zip.filter((record) => record.countyFips === countyFips)
    : dataset.zip;

  const resultByZip = new Map<string, ScoreResult>();
  const recordByZip = new Map<string, EmpowerZipRecord>();

  for (const record of records) {
    const inputs: ScoringInputs = {
      zip: record.zip,
      powerDependentDme: record.powerDependentDme.value,
      severity: severityByZip?.get(record.zip) ?? "none",
      hasActiveOutage: outageByZip?.get(record.zip) ?? false,
    };

    const scored = outreachPriority(inputs, config, knownZips);
    // Skip rejected ZIPs (e.g. UNKNOWN_ZIP): never fabricate a score.
    if (!scored.ok) continue;

    resultByZip.set(record.zip, scored.value);
    recordByZip.set(record.zip, record);
  }

  return rankByPriority([...resultByZip.values()]).map((result) => ({
    // recordByZip always has the ZIP here: it was populated alongside the result.
    record: recordByZip.get(result.zip)!,
    result,
  }));
}

/**
 * Display-only score on a 0–100 scale. The underlying scoring is unchanged; we
 * multiply the normalized score (which is bounded in roughly [0, a few]) by 100
 * and round for a familiar, readable number. The bar width is scaled relative
 * to the highest score currently shown.
 */
function displayScore(score: number): number {
  return Math.round(score * 100);
}

/**
 * Decide whether a reason reflects a factor that actually applies, so we can
 * hide inactive factors ("severity none", "no active outage"). Dependents
 * always apply. This reads the existing reason labels only — no scoring change.
 */
function reasonApplies(reason: Reason): boolean {
  if (reason.signal === "severity") {
    return !/severity\s+none/i.test(reason.label);
  }
  if (reason.signal === "outage") {
    return !/no active outage/i.test(reason.label);
  }
  return true; // dependents
}

/** A small icon (text glyph) per reason signal; paired with text, never color alone. */
function reasonIcon(signal: Reason["signal"]): string {
  switch (signal) {
    case "dependents":
      return "👥";
    case "severity":
      return "⚠";
    case "outage":
      return "⚡";
    default:
      return "•";
  }
}

/** Reason chips: icon + text, only for factors that apply. */
function ReasonChips({ reasons }: { reasons: Reason[] }) {
  const active = reasons.filter(reasonApplies);
  if (active.length === 0) {
    return <span className="text-sm text-slate-600">—</span>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {active.map((reason) => (
        <li
          key={reason.signal}
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-mist px-2.5 py-1 text-sm text-storm-navy"
        >
          <span aria-hidden="true">{reasonIcon(reason.signal)}</span>
          <span>{reason.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The outreach-priority ranked list: the non-map alternative to the
 * County_Choropleth (Requirements 7.4, 7.5, 7.6, 10.2).
 *
 * Each row shows the ZIP, its county, the aggregated power-dependent-DME count
 * (rendered via `SmallCount.label`, so a masked 11 reads "11 or fewer"), the
 * outreach-priority score on a 0–100 scale with a small bar, and the reasons
 * that apply as labeled chips.
 *
 * Accessibility (WCAG 2.2 AA): a semantic `<table>` with a `<caption>`, scoped
 * `<th>` header cells, and a visible rank column. The score and reasons are
 * plain text, so the data is fully available to screen readers and keyboard
 * users without touching the map.
 */
export function RankedList({
  dataset,
  severityByZip,
  outageByZip,
  countyFips,
  limit,
  className,
}: RankedListProps) {
  const allRows = buildRankedRows(
    dataset,
    severityByZip,
    outageByZip,
    countyFips,
  );
  const rows =
    typeof limit === "number" && limit >= 0 ? allRows.slice(0, limit) : allRows;

  // Highest score in the shown set, for scaling the per-row bar (display only).
  const maxScore = rows.reduce((m, { result }) => Math.max(m, result.score), 0);

  const captionText = countyFips
    ? `Outreach priority by ZIP for county ${countyFips}, ranked highest first.`
    : "Outreach priority by ZIP, ranked highest first.";

  return (
    <div
      className={["w-full overflow-x-auto", className ?? ""].join(" ").trim()}
    >
      {rows.length === 0 ? (
        <p className="text-base text-storm-navy">
          No ZIPs to rank for this view.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-base text-storm-navy">
          <caption className="mb-2 text-left text-sm text-slate-600">
            {captionText}
          </caption>
          <thead>
            <tr className="border-b-2 border-slate-300">
              <th scope="col" className="px-3 py-2 font-bold">
                Rank
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                ZIP
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                County
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                Power-dependent (Medicare)
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                Score
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                Reasons
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ record, result }, index) => {
              const score100 = displayScore(result.score);
              const barPct =
                maxScore > 0
                  ? Math.round((result.score / maxScore) * 100)
                  : 0;
              return (
                <tr
                  key={result.zip}
                  className="border-b border-slate-200 align-top"
                >
                  <td className="px-3 py-3 tabular-nums text-slate-600">
                    {index + 1}
                  </td>
                  <th scope="row" className="px-3 py-3 font-bold">
                    {result.zip}
                  </th>
                  <td className="px-3 py-3">{record.county}</td>
                  <td className="px-3 py-3">{record.powerDependentDme.label}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-8 shrink-0 font-bold tabular-nums">
                        {score100}
                      </span>
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-24 overflow-hidden rounded-full bg-mist"
                      >
                        <span
                          className="block h-full rounded-full bg-power-amber"
                          style={{ width: `${barPct}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <ReasonChips reasons={result.reasons} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default RankedList;
