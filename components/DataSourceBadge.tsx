import type { DataSource } from "@/lib/risk-engine";

/**
 * Props for {@link DataSourceBadge}.
 *
 * `source` is typically one of the engine's {@link DataSource} codes, but any
 * string is accepted so the badge can label sources the engine does not model.
 * `updatedAt` is the last-updated timestamp for the data view.
 */
export interface DataSourceBadgeProps {
  source: string;
  updatedAt: string | number | Date;
  className?: string;
}

/**
 * Friendly, honest labels for the engine's known {@link DataSource} codes.
 * emPOWER is called out as aggregated, de-identified Medicare data; NWS alerts
 * are labeled live; simulated data is labeled simulated.
 */
const SOURCE_LABELS: Record<DataSource, string> = {
  "empower-aggregated-deidentified-medicare":
    "HHS emPOWER (aggregated, de-identified Medicare data)",
  "nws-live-alert": "National Weather Service (live)",
  simulated: "Simulated",
};

function labelForSource(source: string): string {
  return SOURCE_LABELS[source as DataSource] ?? source;
}

function toDate(value: string | number | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Format the last-updated time as human-readable text. Falls back to the raw
 * input when it is not a parseable date, so the badge never renders an empty or
 * misleading time.
 */
function formatUpdatedAt(value: string | number | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

/**
 * Presentational badge that labels a data view with its source and
 * last-updated time.
 *
 * Accessibility (WCAG 2.2 AA): meaning is conveyed with text — the literal
 * "Data source:" and "Last updated:" labels — never by color alone. The
 * component renders a self-describing `<dl>` so screen readers announce each
 * term with its value, and the machine-readable `<time dateTime>` carries the
 * exact timestamp.
 */
export function DataSourceBadge({
  source,
  updatedAt,
  className,
}: DataSourceBadgeProps) {
  const sourceLabel = labelForSource(source);
  const date = toDate(updatedAt);
  const isoDateTime = Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString();
  const updatedLabel = formatUpdatedAt(updatedAt);

  return (
    <dl
      className={[
        "inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <div className="flex items-baseline gap-1">
        <dt className="font-medium">Data source:</dt>
        <dd>{sourceLabel}</dd>
      </div>
      <div className="flex items-baseline gap-1">
        <dt className="font-medium">Last updated:</dt>
        <dd>
          <time dateTime={isoDateTime}>{updatedLabel}</time>
        </dd>
      </div>
    </dl>
  );
}

export default DataSourceBadge;
