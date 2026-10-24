import type { EmpowerDataset, Reason, Severity } from "@/lib/risk-engine";
import {
  buildRankedRows,
  displayScore,
  reasonApplies,
} from "@/lib/app/planner/rank";

/**
 * Props for {@link RankedList}.
 *
 * This is the non-map path to the planner's outreach-priority data
 * (Requirements 7.4, 10.2): it reproduces the same ranking the map visualizes,
 * as an accessible table that needs no map interaction.
 *
 * `severityByZip` and `outageByZip` are driven by the planner page (live NWS
 * alerts and, in simulated modes, simulated outages). When a ZIP is absent from
 * either map, the component defaults to `"none"` severity and no active outage —
 * never fabricating a signal.
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
  /** The ZIP currently selected on the map; its row is highlighted. */
  selectedZip?: string;
  /** When provided, each ZIP becomes a button that selects it (pans the map). */
  onSelectZip?: (zip: string) => void;
  className?: string;
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
export function ReasonChips({ reasons }: { reasons: Reason[] }) {
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
 * The outreach-priority ranked list: the non-map alternative to the map
 * (Requirements 7.4, 7.5, 7.6, 10.2).
 *
 * Each row shows the ZIP, its county, the aggregated power-dependent-DME count
 * (rendered via `SmallCount.label`, so a masked 11 reads "11 or fewer"), the
 * outreach-priority score on a 0–100 scale with a small bar, and the reasons
 * that apply as labeled chips. The selected ZIP's row is highlighted and marked
 * `aria-current`.
 */
export function RankedList({
  dataset,
  severityByZip,
  outageByZip,
  countyFips,
  limit,
  selectedZip,
  onSelectZip,
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
            {onSelectZip ? " Select a ZIP to show it on the map." : ""}
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
                maxScore > 0 ? Math.round((result.score / maxScore) * 100) : 0;
              const isSelected = selectedZip === result.zip;
              return (
                <tr
                  key={result.zip}
                  data-zip={result.zip}
                  aria-current={isSelected ? "true" : undefined}
                  className={[
                    "border-b border-slate-200 align-top",
                    isSelected
                      ? "bg-power-amber/15 outline outline-2 -outline-offset-2 outline-storm-navy"
                      : "",
                  ].join(" ")}
                >
                  <td className="px-3 py-3 tabular-nums text-slate-600">
                    {index + 1}
                  </td>
                  <th scope="row" className="px-3 py-3 font-bold">
                    {onSelectZip ? (
                      <button
                        type="button"
                        onClick={() => onSelectZip(result.zip)}
                        className="min-h-[44px] min-w-[44px] rounded px-1 text-left font-bold text-storm-navy underline decoration-dotted underline-offset-4 hover:decoration-solid"
                      >
                        {result.zip}
                      </button>
                    ) : (
                      result.zip
                    )}
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
