"use client";

// components/CountyChoropleth.tsx
//
// The planner dashboard's Massachusetts county choropleth (Requirements 7.1,
// 7.2, 7.3, 10.3). It colors the 14 MA counties from
// `public/ma-counties.geojson` by the aggregated power-dependent-DME count per
// county (`aggregateCountyDependents`) and overlays the highest active NWS
// alert severity per county.
//
// Leaflet needs `window`, so this component is client-only and is consumed by
// the planner page via `dynamic(..., { ssr: false })` (task 17.1). It only
// builds the map here.
//
// Honesty + accessibility:
// - Color never carries meaning alone: every county's dependent count and its
//   alert severity are also written into the per-county tooltip text, and the
//   RankedList on the page is the full non-map path to the same data
//   (Requirements 7.4, 10.2).
// - An active alert is shown with a distinct dashed, heavier border AND named in
//   the tooltip ("Active alert: Severe"), not by color alone.
// - The map container and the tile layer carry accessible names/attribution.

import { useEffect, useMemo, useState } from "react";
import type { GeoJSON as LeafletGeoJSON, Layer, PathOptions } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { GeoJSON, MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import type { EmpowerDataset, Severity } from "@/lib/risk-engine";
// Import the runtime `SEVERITY_ORDER` from its pure module, NOT the barrel: the
// barrel re-exports server-only filesystem loaders (`node:fs`), and this
// component is client-bundled (consumed via `dynamic(..., { ssr: false })`).
import { SEVERITY_ORDER } from "@/lib/risk-engine/alert-loader";
import { aggregateCountyDependents } from "@/lib/app/planner/aggregate";

/** Properties we expect on every feature in `public/ma-counties.geojson`. */
interface CountyFeatureProperties {
  county_fips: string;
  county: string;
}

type CountyFeature = Feature<Geometry, CountyFeatureProperties>;
type CountyCollection = FeatureCollection<Geometry, CountyFeatureProperties>;

export interface CountyChoroplethProps {
  /** Loaded emPOWER dataset (from `/api/empower`). */
  dataset: EmpowerDataset;
  /**
   * Highest active NWS severity per `county_fips`. Counties absent from the map
   * (or set to `"none"`) are treated as having no active alert.
   */
  countySeverity?: Map<string, Severity>;
  /** The currently selected county's FIPS, if any (highlighted on the map). */
  selectedCountyFips?: string;
  /** Called with a `county_fips` when the user clicks a county. */
  onSelectCounty?: (countyFips: string) => void;
  className?: string;
}

/** Path to the lightweight 14-county MA GeoJSON served from `public/`. */
const GEOJSON_URL = "/ma-counties.geojson";

/** MA center and zoom that frame all 14 counties on a desktop dashboard. */
const MA_CENTER: [number, number] = [42.15, -71.6];
const MA_ZOOM = 7;

/**
 * Sequential 5-bucket fill scale (light → dark blue) for the dependent count.
 * Darker means more power-dependent Medicare residents. These are also chosen
 * to read against the dashed red alert border; color is never the only signal.
 */
const FILL_BUCKETS = [
  "#eff6ff", // bucket 0 (lowest)
  "#bfdbfe",
  "#60a5fa",
  "#2563eb",
  "#1e3a8a", // bucket 4 (highest)
] as const;

/** Fill color for a county whose total is 0 or unknown. */
const EMPTY_FILL = "#f3f4f6";

/**
 * Pick a fill color for a county total given the dataset-wide maximum. The max
 * defines the top of the scale; totals are split into five linear buckets.
 */
function fillForTotal(total: number, max: number): string {
  if (total <= 0 || max <= 0) return EMPTY_FILL;
  const ratio = Math.min(total / max, 1);
  // Map (0, 1] onto bucket indices 0..4.
  const index = Math.min(FILL_BUCKETS.length - 1, Math.floor(ratio * FILL_BUCKETS.length));
  return FILL_BUCKETS[index];
}

/** True when a severity represents a real, active alert (not "none"). */
function hasAlert(severity: Severity | undefined): severity is Severity {
  return severity !== undefined && severity !== "none";
}

/**
 * The county choropleth. Fetches the GeoJSON on mount (client-only), colors each
 * county by its aggregated dependent count, overlays alert severity, and reports
 * county clicks via `onSelectCounty`.
 */
export function CountyChoropleth({
  dataset,
  countySeverity,
  selectedCountyFips,
  onSelectCounty,
  className,
}: CountyChoroplethProps) {
  const [geojson, setGeojson] = useState<CountyCollection | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(GEOJSON_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load counties (${res.status})`);
        return res.json() as Promise<CountyCollection>;
      })
      .then((data) => {
        if (!cancelled) setGeojson(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Per-county dependent totals and the dataset-wide max for the color scale.
  const { totals, max } = useMemo(() => {
    const totals = aggregateCountyDependents(dataset.zip);
    let max = 0;
    for (const value of totals.values()) {
      if (value > max) max = value;
    }
    return { totals, max };
  }, [dataset]);

  // Style each county feature by its total, selection, and alert overlay.
  const styleFeature = useMemo(() => {
    return (feature?: CountyFeature): PathOptions => {
      const fips = feature?.properties?.county_fips ?? "";
      const total = totals.get(fips) ?? 0;
      const severity = countySeverity?.get(fips);
      const isSelected = fips === selectedCountyFips;
      const alerted = hasAlert(severity);

      return {
        fillColor: fillForTotal(total, max),
        fillOpacity: 0.75,
        // Alerted counties get a distinct dashed, heavier border; selected
        // counties get the heaviest border. Neither relies on color alone.
        color: alerted ? "#b91c1c" : isSelected ? "#111827" : "#6b7280",
        weight: isSelected ? 4 : alerted ? 3 : 1,
        dashArray: alerted ? "6 4" : undefined,
        opacity: 1,
      };
    };
  }, [totals, max, countySeverity, selectedCountyFips]);

  // Bind each feature: a text tooltip (count + alert) and a click handler.
  const onEachFeature = useMemo(() => {
    return (feature: CountyFeature, layer: Layer) => {
      const fips = feature.properties?.county_fips ?? "";
      const name = feature.properties?.county ?? fips;
      const total = totals.get(fips) ?? 0;
      const severity = countySeverity?.get(fips);

      const countText = `${total.toLocaleString()} power-dependent Medicare residents`;
      const alertText = hasAlert(severity)
        ? `Active alert: ${severity}`
        : "No active alert";
      // Tooltip text carries the meaning so color is never the only signal.
      layer.bindTooltip(`${name} County — ${countText}. ${alertText}.`, {
        sticky: true,
      });

      layer.on("click", () => {
        onSelectCounty?.(fips);
      });
    };
  }, [totals, countySeverity, onSelectCounty]);

  // Remounting the GeoJSON layer when inputs change forces Leaflet to re-run
  // `style`/`onEachFeature` (it caches them per layer instance otherwise).
  const geoJsonKey = useMemo(() => {
    const severityKey = countySeverity
      ? [...countySeverity.entries()]
          .map(([fips, sev]) => `${fips}:${SEVERITY_ORDER[sev]}`)
          .sort()
          .join(",")
      : "";
    return `${selectedCountyFips ?? ""}|${severityKey}`;
  }, [selectedCountyFips, countySeverity]);

  const wrapperClass = ["relative h-full w-full", className ?? ""].join(" ").trim();

  if (loadError) {
    // The RankedList remains the full non-map path to this data, so a map
    // failure degrades gracefully instead of blocking the dashboard.
    return (
      <div
        className={wrapperClass}
        role="img"
        aria-label="Massachusetts county map unavailable. Use the ranked list below for the same data."
      >
        <p className="p-4 text-base text-gray-800">
          The county map could not load. The ranked list below shows the same
          outreach-priority data.
        </p>
      </div>
    );
  }

  return (
    <div
      className={wrapperClass}
      role="region"
      aria-label="Massachusetts counties: power-dependent Medicare residents, with active weather alerts"
    >
      <MapContainer
        center={MA_CENTER}
        zoom={MA_ZOOM}
        scrollWheelZoom={false}
        className="h-full w-full"
        // Leaflet's root is a focusable div; name it for assistive tech.
        aria-label="Interactive map of Massachusetts counties"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {geojson && (
          <GeoJSON
            key={geoJsonKey}
            data={geojson as unknown as GeoJSON.GeoJsonObject}
            style={styleFeature as (feature?: Feature) => PathOptions}
            onEachFeature={
              onEachFeature as (feature: Feature, layer: Layer) => void
            }
            ref={(instance: LeafletGeoJSON | null) => {
              // No-op ref retained for potential imperative fit-bounds later.
              void instance;
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}

export default CountyChoropleth;
