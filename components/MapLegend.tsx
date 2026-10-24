"use client";

// components/MapLegend.tsx
//
// Legend and layer toggles for the planner map. Rendered OUTSIDE the Leaflet
// canvas as plain labeled checkboxes, so it is keyboard and screen-reader
// friendly and never depends on the map loading. Every swatch is paired with
// text, so color is never the only signal.

import { PRIORITY_BUCKETS, type PriorityBucket } from "@/lib/app/planner/rank";
import { Zap } from "lucide-react";
import { mapColors } from "@/components/ui/tokens";
import { cardClasses } from "@/components/ui/Card";
import { checkboxClasses } from "@/components/ui/Field";

export interface MapLayers {
  dependents: boolean;
  alerts: boolean;
  outages: boolean;
}

export const DEFAULT_LAYERS: MapLayers = {
  dependents: true,
  alerts: true,
  outages: true,
};

/** Circle fill per priority bucket (shared with the map). From the theme. */
export const BUCKET_FILL: Record<PriorityBucket, string> = mapColors.bucket;

/** County fill ramp (light to dark) for power-dependent totals. From the theme. */
export const COUNTY_FILL = mapColors.county;

export interface MapLegendProps {
  layers: MapLayers;
  onChange: (next: MapLayers) => void;
  /** Whether any outage source (Storm Scenario or Storm Replay) is active. */
  outagesSimulated?: boolean;
}

function Toggle({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-md px-2 text-base text-storm-navy hover:bg-mist"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={checkboxClasses}
      />
      {children}
    </label>
  );
}

export function MapLegend({ layers, onChange, outagesSimulated }: MapLegendProps) {
  return (
    <div className={cardClasses({ padding: "sm", className: "flex flex-col gap-5" })}>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-lg font-bold text-storm-navy">Map layers</legend>
        <Toggle
          id="layer-dependents"
          checked={layers.dependents}
          onChange={(v) => onChange({ ...layers, dependents: v })}
        >
          Power dependent residents
        </Toggle>
        <Toggle
          id="layer-alerts"
          checked={layers.alerts}
          onChange={(v) => onChange({ ...layers, alerts: v })}
        >
          Weather alerts
        </Toggle>
        <Toggle
          id="layer-outages"
          checked={layers.outages}
          onChange={(v) => onChange({ ...layers, outages: v })}
        >
          Outages{outagesSimulated ? " (Simulated)" : ""}
        </Toggle>
      </fieldset>

      <div className="flex flex-col gap-2 border-t border-neutral-200 pt-4" aria-label="Map legend">
        <p className="text-lg font-bold text-storm-navy">Legend</p>
        <p className="text-sm text-neutral-700">
          Circles are ZIP codes. Bigger circles mean more power dependent
          Medicare residents.
        </p>
        <ul className="flex flex-col gap-1 text-sm text-storm-navy">
          {PRIORITY_BUCKETS.map((b) => (
            <li key={b.bucket} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 rounded-full border-2 border-storm-navy"
                style={{ background: BUCKET_FILL[b.bucket] }}
              />
              Outreach priority: {b.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2 border-t border-neutral-200 pt-4">
        <p className="text-lg font-bold text-storm-navy">County borders</p>
        <ul className="flex flex-col gap-1 text-sm text-storm-navy">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-4 w-6 border-2 border-dashed border-alert-red" />
            Severe or extreme weather alert
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-4 w-6 border-2 border-dotted border-storm-navy" />
            Minor or moderate weather alert
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-4 w-6 border-4 border-storm-navy bg-power-amber/40" />
            <Zap aria-hidden="true" focusable="false" className="h-4 w-4 flex-none" /> Outage area{outagesSimulated ? " (Simulated)" : ""}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-4 w-6 border-2 border-dashed border-calm-green" />
            Power restoring{outagesSimulated ? " (Simulated)" : ""}
          </li>
        </ul>
        <p className="text-sm text-neutral-700">
          Darker county shading means more power dependent residents.
        </p>
      </div>
    </div>
  );
}

export default MapLegend;
