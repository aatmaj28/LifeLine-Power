import type {
  EmpowerDataset,
  EmpowerZipRecord,
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
 * Format a numeric score for display with two decimal places.
 */
function formatScore(score: number): string {
  return score.toFixed(2);
}

/**
 * The outreach-priority ranked list: the non-map alternative to the
 * County_Choropleth (Requirements 7.4, 7.5, 7.6, 10.2).
 *
 * Each row shows the ZIP, its county, the aggregated power-dependent-DME count
 * (rendered via `SmallCount.label`, so a masked 11 reads "11 or fewer"), the
 * numeric outreach-priority score, and the labeled reasons that sum to it.
 *
 * Accessibility (WCAG 2.2 AA): a semantic `<table>` with a `<caption>`, scoped
 * `<th>` header cells, and a visible rank column. The score and reasons are
 * plain text, so the data is fully available to screen readers and keyboard
 * users without touching the map. Reasons render as a `<ul>` so each signal is
 * announced as a distinct list item.
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

  const captionText = countyFips
    ? `Outreach priority by ZIP for county ${countyFips}, ranked highest first.`
    : "Outreach priority by ZIP, ranked highest first.";

  return (
    <div
      className={["w-full overflow-x-auto", className ?? ""].join(" ").trim()}
    >
      {rows.length === 0 ? (
        <p className="text-base text-gray-800">
          No ZIPs to rank for this view.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-base text-gray-900">
          <caption className="mb-2 text-left text-sm text-gray-700">
            {captionText}
          </caption>
          <thead>
            <tr className="border-b border-gray-300">
              <th scope="col" className="px-3 py-2 font-semibold">
                Rank
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                ZIP
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                County
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Power-dependent (Medicare)
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Score
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Reasons
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ record, result }, index) => (
              <tr
                key={result.zip}
                className="border-b border-gray-200 align-top"
              >
                <td className="px-3 py-2 tabular-nums">{index + 1}</td>
                <th scope="row" className="px-3 py-2 font-medium">
                  {result.zip}
                </th>
                <td className="px-3 py-2">{record.county}</td>
                <td className="px-3 py-2">{record.powerDependentDme.label}</td>
                <td className="px-3 py-2 tabular-nums">
                  {formatScore(result.score)}
                </td>
                <td className="px-3 py-2">
                  <ul className="list-disc space-y-1 pl-5">
                    {result.reasons.map((reason) => (
                      <li key={reason.signal}>{reason.label}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default RankedList;
