"use client";

// components/CountyChoropleth.tsx
//
// The planner's hero map (Requirements 3.1-3.6 of wow-features; 7.1-7.3 of app).
//   - County shading by aggregated power-dependent count (aggregateCountyDependents).
//   - One circle per ZIP (from public/ma-zip-centroids.json), sized by
//     power_dependent_dme and colored by outreach priority.
//   - Weather alert and outage overlays as county borders.
//   - Clicking a ZIP opens a popup and reports the selection; selecting a ZIP
//     from the ranked list pans here and opens its popup.
//
// Leaflet needs `window`, so this component is client-only and is consumed via
// `dynamic(..., { ssr: false })`. Canvas circles are not reachable by assistive
// tech; the ranked list on the page is the full non-map path to the same data.
// Color is never the only signal: popups and tooltips carry the numbers in text,
// and the legend pairs every swatch with words.

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CircleMarker as LeafletCircleMarker,
  Layer,
  PathOptions,
} from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

import type { EmpowerDataset, Reason, Severity } from "@/lib/risk-engine";
// Pure module import (not the barrel): this component is client-bundled.
import { SEVERITY_ORDER } from "@/lib/risk-engine/alert-loader";
import { aggregateCountyDependents } from "@/lib/app/planner/aggregate";
import { priorityBucket, reasonApplies } from "@/lib/app/planner/rank";
import centroidsJson from "@/public/ma-zip-centroids.json";

import { BUCKET_FILL, COUNTY_FILL, DEFAULT_LAYERS, type MapLayers } from "./MapLegend";

const CENTROIDS = centroidsJson as unknown as Record<string, [number, number]>;

interface CountyFeatureProperties {
  county_fips: string;
  county: string;
}
type CountyFeature = Feature<Geometry, CountyFeatureProperties>;
type CountyCollection = FeatureCollection<Geometry, CountyFeatureProperties>;

/** Score + active reasons per ZIP, computed once on the page (same as the list). */
export interface ZipScore {
  score100: number;
  reasons: Reason[];
}

export interface CountyChoroplethProps {
  /** Loaded emPOWER dataset (from `/api/empower`). */
  dataset: EmpowerDataset;
  /** Highest active NWS severity per `county_fips`. */
  countySeverity?: Map<string, Severity>;
  /** The currently selected county's FIPS, if any. */
  selectedCountyFips?: string;
  /** Called with a `county_fips` when the user clicks a county. */
  onSelectCounty?: (countyFips: string) => void;
  /** Score per ZIP (0–100 display) and reasons; drives circle color + popup. */
  scores?: Map<string, ZipScore>;
  /** Active outage per ZIP (Storm Scenario or Storm Replay; simulated). */
  outageByZip?: Map<string, boolean>;
  /** Simulated replay status per county. */
  countyOutage?: Map<string, "outage" | "restoring">;
  /** Whether the outage overlay comes from simulated data. */
  outagesSimulated?: boolean;
  /** The ZIP selected on the map or in the list. */
  selectedZip?: string;
  /** Called when the user clicks a ZIP circle. */
  onSelectZip?: (zip: string) => void;
  /** Which layers are visible. */
  layers?: MapLayers;
  className?: string;
}

const GEOJSON_URL = "/ma-counties.geojson";
const MA_CENTER: [number, number] = [42.05, -71.4];
const MA_ZOOM = 8;
const EMPTY_FILL = "#F8FAFC";

function fillForTotal(total: number, max: number): string {
  if (total <= 0 || max <= 0) return EMPTY_FILL;
  const ratio = Math.min(total / max, 1);
  const index = Math.min(COUNTY_FILL.length - 1, Math.floor(ratio * COUNTY_FILL.length));
  return COUNTY_FILL[index];
}

function isAlert(severity: Severity | undefined): severity is Severity {
  return severity !== undefined && severity !== "none";
}

function isSevere(severity: Severity | undefined): boolean {
  return severity === "Severe" || severity === "Extreme";
}

/** Circle radius in pixels, by square root so big ZIPs don't swamp small ones. */
export function zipRadius(value: number): number {
  return 4 + Math.sqrt(Math.max(0, value)) * 0.9;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Pans to the selected ZIP and opens its popup. Lives inside MapContainer. */
function FollowSelection({
  selectedZip,
  markers,
}: {
  selectedZip?: string;
  markers: React.MutableRefObject<Map<string, LeafletCircleMarker>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selectedZip) return;
    const point = CENTROIDS[selectedZip];
    if (!point) return;
    const zoom = Math.max(map.getZoom(), 10);
    if (prefersReducedMotion()) {
      map.setView(point, zoom, { animate: false });
    } else {
      map.flyTo(point, zoom, { duration: 0.8 });
    }
    markers.current.get(selectedZip)?.openPopup();
  }, [selectedZip, map, markers]);
  return null;
}

export function CountyChoropleth({
  dataset,
  countySeverity,
  selectedCountyFips,
  onSelectCounty,
  scores,
  outageByZip,
  countyOutage,
  outagesSimulated,
  selectedZip,
  onSelectZip,
  layers = DEFAULT_LAYERS,
  className,
}: CountyChoroplethProps) {
  const [geojson, setGeojson] = useState<CountyCollection | null>(null);
  const [loadError, setLoadError] = useState(false);
  const markers = useRef(new Map<string, LeafletCircleMarker>());

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

  const { totals, max } = useMemo(() => {
    const totals = aggregateCountyDependents(dataset.zip);
    let max = 0;
    for (const value of totals.values()) if (value > max) max = value;
    return { totals, max };
  }, [dataset]);

  // Counties with any outage ZIP (Storm Scenario) plus replay county statuses.
  const outageCounties = useMemo(() => {
    const status = new Map<string, "outage" | "restoring">(countyOutage ?? []);
    if (outageByZip) {
      for (const record of dataset.zip) {
        if (outageByZip.get(record.zip)) status.set(record.countyFips, "outage");
      }
    }
    return status;
  }, [dataset, outageByZip, countyOutage]);

  const styleFeature = useMemo(() => {
    return (feature?: CountyFeature): PathOptions => {
      const fips = feature?.properties?.county_fips ?? "";
      const severity = layers.alerts ? countySeverity?.get(fips) : undefined;
      const outage = layers.outages ? outageCounties.get(fips) : undefined;
      const isSelected = fips === selectedCountyFips;

      let color = "#64748B";
      let weight = 1;
      let dashArray: string | undefined;
      if (isAlert(severity)) {
        color = isSevere(severity) ? "#B42318" : "#1B2A41";
        weight = 3;
        dashArray = isSevere(severity) ? "8 5" : "2 5";
      }
      if (outage === "outage") {
        color = "#1B2A41";
        weight = 5;
        dashArray = undefined;
      } else if (outage === "restoring") {
        color = "#2F7D4F";
        weight = 3;
        dashArray = "8 5";
      }
      if (isSelected) weight = Math.max(weight, 5);

      return {
        fillColor:
          outage === "outage"
            ? "#E8A317"
            : layers.dependents
              ? fillForTotal(totals.get(fips) ?? 0, max)
              : EMPTY_FILL,
        fillOpacity: outage === "outage" ? 0.35 : 0.6,
        color,
        weight,
        dashArray,
        opacity: 1,
      };
    };
  }, [totals, max, countySeverity, outageCounties, selectedCountyFips, layers]);

  const onEachFeature = useMemo(() => {
    return (feature: CountyFeature, layer: Layer) => {
      const fips = feature.properties?.county_fips ?? "";
      const name = feature.properties?.county ?? fips;
      const total = totals.get(fips) ?? 0;
      const severity = countySeverity?.get(fips);
      const outage = outageCounties.get(fips);
      const parts = [`${name} County — ${total.toLocaleString()} power-dependent Medicare residents`];
      if (layers.alerts) parts.push(isAlert(severity) ? `Active alert: ${severity}` : "No active alert");
      if (layers.outages && outage) {
        const tag = outagesSimulated ? " (Simulated)" : "";
        parts.push(outage === "outage" ? `Outage area${tag}` : `Power restoring${tag}`);
      }
      layer.bindTooltip(parts.join(". ") + ".", { sticky: true });
      layer.on("click", () => onSelectCounty?.(fips));
    };
  }, [totals, countySeverity, outageCounties, layers, outagesSimulated, onSelectCounty]);

  // Remount the GeoJSON layer when inputs change so Leaflet re-runs style/onEachFeature.
  const geoJsonKey = useMemo(() => {
    const sev = countySeverity
      ? [...countySeverity.entries()].map(([f, s]) => `${f}:${SEVERITY_ORDER[s]}`).sort().join(",")
      : "";
    const out = [...outageCounties.entries()].map(([f, s]) => `${f}:${s}`).sort().join(",");
    return [selectedCountyFips ?? "", sev, out, layers.dependents, layers.alerts, layers.outages].join("|");
  }, [selectedCountyFips, countySeverity, outageCounties, layers]);

  const wrapperClass = ["relative h-full w-full", className ?? ""].join(" ").trim();

  if (loadError) {
    return (
      <div
        className={wrapperClass}
        role="img"
        aria-label="Massachusetts map unavailable. Use the ranked list below for the same data."
      >
        <p className="p-4 text-base text-storm-navy">
          The map could not load. The ranked list below shows the same outreach
          priority data.
        </p>
      </div>
    );
  }

  return (
    <div
      className={wrapperClass}
      role="region"
      aria-label="Map of Massachusetts counties and ZIP codes: power-dependent Medicare residents, weather alerts, and outages. The ranked list below has the same data."
    >
      <MapContainer
        center={MA_CENTER}
        zoom={MA_ZOOM}
        preferCanvas
        scrollWheelZoom={false}
        className="h-full w-full"
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
            onEachFeature={onEachFeature as (feature: Feature, layer: Layer) => void}
          />
        )}

        {layers.dependents &&
          dataset.zip.map((record) => {
            const point = CENTROIDS[record.zip];
            if (!point) return null; // 2 ZIPs have no Census ZCTA (see data-notes.md)
            const s = scores?.get(record.zip);
            const score100 = s?.score100 ?? 0;
            const bucket = priorityBucket(score100);
            const outage = layers.outages && outageByZip?.get(record.zip);
            const selected = selectedZip === record.zip;
            const active = (s?.reasons ?? []).filter(reasonApplies);
            return (
              <CircleMarker
                key={record.zip}
                center={point}
                radius={zipRadius(record.powerDependentDme.value)}
                ref={(m) => {
                  if (m) markers.current.set(record.zip, m);
                  else markers.current.delete(record.zip);
                }}
                pathOptions={{
                  color: selected ? "#E8A317" : "#1B2A41",
                  weight: selected ? 4 : outage ? 3 : 1,
                  fillColor: BUCKET_FILL[bucket],
                  fillOpacity: 0.85,
                }}
                eventHandlers={{ click: () => onSelectZip?.(record.zip) }}
              >
                <Popup>
                  <div className="flex flex-col gap-1 text-sm text-storm-navy">
                    <p className="text-base font-bold">ZIP {record.zip}</p>
                    <p>{record.county} County</p>
                    <p>
                      Power dependent Medicare residents:{" "}
                      <strong>{record.powerDependentDme.label}</strong>
                    </p>
                    <p>
                      Outreach score: <strong>{score100}</strong>
                    </p>
                    {active.length > 0 ? (
                      <ul className="list-disc pl-4">
                        {active.map((r) => (
                          <li key={r.signal}>
                            {r.label}
                            {r.signal === "outage" && outagesSimulated ? " (Simulated)" : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}

        <FollowSelection selectedZip={selectedZip} markers={markers} />
      </MapContainer>
    </div>
  );
}

export default CountyChoropleth;
