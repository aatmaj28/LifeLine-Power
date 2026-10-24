"use client";

// components/MapLegend.tsx
//
// Legend and layer toggles for the planner map. Rendered OUTSIDE the Leaflet
// canvas as plain labeled checkboxes, so it is keyboard and screen-reader
// friendly and never depends on the map loading. Every swatch is paired with
// text, so color is never the only signal.

import { PRIORITY_BUCKETS, type PriorityBucket } from "@/lib/app/planner/rank";

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

/** Circle fill per priority bucket (shared with the map). */
export const BUCKET_FILL: Record<PriorityBucket, string> = {
  lower: "#D3DAE4",
  medium: "#8C9CB3",
  higher: "#4A5D7C",
  highest: "#E8A317",
};

/** County fill ramp (light to dark slate) for power-dependent totals. */
export const COUNTY_FILL = ["#F1F5F9", "#E2E8F0", "#CBD5E1", "#94A3B8", "#64748B"] as const;

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
      className="inline-flex min-h-[44px] items-center gap-3 text-base text-storm-navy"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-6 rounded border-slate-400"
      />
      {children}
    </label>
  );
}

export function MapLegend({ layers, onChange, outagesSimulated }: MapLegendProps) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-300 bg-white p-4 lg:flex-row lg:items-start lg:gap-10">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-base font-bold text-storm-navy">Map layers</legend>
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

      <div className="flex flex-col gap-2" aria-label="Map legend">
        <p className="text-base font-bold text-storm-navy">Legend</p>
        <p className="text-sm text-slate-700">
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

      <div className="flex flex-col gap-2">
        <p className="text-base font-bold text-storm-navy">County borders</p>
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
            <span aria-hidden="true">⚡</span> Outage area{outagesSimulated ? " (Simulated)" : ""}
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-4 w-6 border-2 border-dashed border-calm-green" />
            Power restoring{outagesSimulated ? " (Simulated)" : ""}
          </li>
        </ul>
        <p className="text-sm text-slate-700">
          Darker county shading means more power dependent residents.
        </p>
      </div>
    </div>
  );
}

export default MapLegend;
