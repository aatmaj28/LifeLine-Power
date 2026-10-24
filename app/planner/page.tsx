"use client";

// app/planner/page.tsx
//
// The planner dashboard (Requirements 7.2, 7.3, 8.1-8.4, 9.1, 9.3, 9.4).
//
// A desktop, CLIENT page that fetches live emPOWER + live NWS alerts on mount
// and, when Storm Scenario mode is ON, also fetches the simulated-outage layer.
// It renders:
//   - a Massachusetts county choropleth (Leaflet, loaded client-only via
//     `dynamic(..., { ssr: false })` because Leaflet needs `window`), and
//   - a RankedList that is the full NON-MAP path to the same outreach-priority
//     data (so the dashboard works without any map interaction).
//
// Honesty rules enforced here:
//   - Every data view carries a DataSourceBadge (source + last-updated).
//   - emPOWER is labeled aggregated, de-identified Medicare data.
//   - The simulated outage layer is labeled with a SimulatedBadge, and ONLY
//     that layer — never the whole dashboard.
//   - On any fetch/envelope error we show a plain message and never fabricate
//     data (no map, no ranked rows invented).
//   - SmallCount "11 or fewer" masking is already honored by RankedList.
//
// JSON note: the emPOWER route serializes an `EmpowerDataset`, but its two Map
// fields (`zipByCode` / `zipsByCountyFips`) do not survive JSON. The payload we
// actually receive is `{ zip, county, monthly }`. RankedList and the choropleth
// only need `dataset.zip` / `dataset.county`, and `buildScoringConfig` reads
// both arrays. To use `mapAlertsToZips` (which wants a `zipsByCountyFips` Map)
// we rebuild that minimal index client-side from `dataset.zip`.

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import {
  CloudLightning,
  FlaskConical,
  ListOrdered,
  Map as MapIcon,
  TriangleAlert,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import DataSourceBadge from "@/components/DataSourceBadge";
import { Button } from "@/components/ui/Button";
import { cardClasses } from "@/components/ui/Card";
import { checkboxClasses, hintClasses } from "@/components/ui/Field";
import { SectionHeading, h1Classes, h2Classes } from "@/components/ui/SectionHeading";

/** A toggle row in the sidebar: large, bordered, whole row clickable. */
const toggleRowClasses =
  "flex min-h-[48px] cursor-pointer items-start gap-3 rounded-lg border-2 border-neutral-200 bg-white px-3 py-3 text-base leading-snug text-storm-navy hover:border-storm-navy has-[:checked]:border-storm-navy has-[:checked]:bg-mist";

/** One summary stat: label, big value, short note. Rendered inside a <dl>. */
function StatCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className={cardClasses({ className: "flex flex-col gap-2" })}>
      <dt className="flex items-center gap-2 text-base font-semibold text-neutral-700">
        <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-mist text-storm-navy">
          <Icon aria-hidden="true" focusable="false" className="h-5 w-5" />
        </span>
        {label}
      </dt>
      <dd className="text-3xl font-bold tabular-nums text-storm-navy sm:text-4xl">{value}</dd>
      <dd className="text-sm leading-relaxed text-neutral-600">{note}</dd>
    </div>
  );
}

/** Count distinct counties with an active outage (records may name a ZIP, a county name, or a FIPS). */
function countOutageCounties(
  outages: ReadonlyArray<{ zip?: string; county?: string; active: boolean }>,
  zips: ReadonlyArray<{ zip: string; county: string; countyFips: string }>,
): number {
  const fipsByZip = new Map(zips.map((z) => [z.zip, z.countyFips]));
  const fipsByName = new Map(
    zips.map((z) => [z.county.toLowerCase().replace(/\s+county$/, ""), z.countyFips]),
  );
  const counties = new Set<string>();
  for (const o of outages) {
    if (!o.active) continue;
    let key = o.zip ? fipsByZip.get(o.zip) : undefined;
    if (!key && o.county) {
      const c = o.county.trim();
      key = /^\d{5}$/.test(c)
        ? c
        : (fipsByName.get(c.toLowerCase().replace(/\s+county$/, "")) ?? c.toLowerCase());
    }
    if (key) counties.add(key);
  }
  return counties.size;
}
import MapLegend, { DEFAULT_LAYERS, type MapLayers } from "@/components/MapLegend";
import RankedList from "@/components/RankedList";
import SimulatedBadge from "@/components/SimulatedBadge";
import type { ZipScore } from "@/components/CountyChoropleth";
import StormReplay from "@/components/StormReplay";
import { buildRankedRows, displayScore } from "@/lib/app/planner/rank";
import {
  clampHour,
  countyStatusForFrame,
  outageFlagsForFrame,
  parseReplayFile,
} from "@/lib/app/replay/replay";
// The simulated replay is a small static file, bundled at build time.
import replayJson from "@/data/sim-storm-replay.json";

const REPLAY = parseReplayFile(replayJson);
// Import only pure engine code into this client bundle. The engine barrel
// (`@/lib/risk-engine`) re-exports server-only filesystem loaders that use
// `node:fs`, so a client component must not pull it in at runtime. The alert
// core (`compareSeverity`, `mapAlertsToZips`) is pure; the dataset/outage
// shapes are type-only and are erased at build time.
import { compareSeverity, mapAlertsToZips } from "@/lib/risk-engine/alert-loader";
import type { NwsAlert } from "@/lib/risk-engine/alert-loader";
import type {
  EmpowerDataset,
  EmpowerZipRecord,
} from "@/lib/risk-engine/empower-loader";
import type { SimulatedOutage } from "@/lib/risk-engine/outage-loader";
import type { Severity } from "@/lib/risk-engine/types";
import { outageFlagsByZip } from "@/lib/app/planner/outage-flags";

// The Leaflet choropleth is client-only: Leaflet touches `window` at import
// time, so it must never be server-rendered.
const CountyChoropleth = dynamic(
  () => import("@/components/CountyChoropleth"),
  { ssr: false },
);

/**
 * The shape the emPOWER route actually puts on the wire. The engine's
 * `EmpowerDataset` also carries two `Map` indexes, but Maps do not survive
 * JSON, so the client receives only the record arrays.
 */
type EmpowerDatasetWire = Pick<EmpowerDataset, "zip" | "county" | "monthly">;

/** The API envelope every route returns. */
type ApiEnvelope<T> =
  | { ok: true; value: T; source: string; updatedAt: string }
  | { ok: false; error: { code: string; field?: string; message: string } };

/** Loading / error state for one fetched resource. */
interface Loadable<T> {
  status: "loading" | "ok" | "error";
  value?: T;
  updatedAt?: string;
  source?: string;
  errorMessage?: string;
}

const EMPTY_LOADING: Loadable<never> = { status: "loading" };

/**
 * Fetch one API route and normalize its envelope into a {@link Loadable}. A
 * network failure, a non-ok HTTP status, or an `{ ok: false }` envelope all
 * resolve to an honest `error` state carrying a plain message — never a
 * fabricated value.
 */
async function fetchEnvelope<T>(url: string): Promise<Loadable<T>> {
  try {
    const res = await fetch(url);
    const body = (await res.json()) as ApiEnvelope<T>;
    if (!res.ok || !body.ok) {
      const message =
        body && body.ok === false
          ? body.error.message
          : `Request failed (${res.status}).`;
      return { status: "error", errorMessage: message };
    }
    return {
      status: "ok",
      value: body.value,
      updatedAt: body.updatedAt,
      source: body.source,
    };
  } catch (err) {
    return {
      status: "error",
      errorMessage:
        err instanceof Error ? err.message : "Could not load this data.",
    };
  }
}

/**
 * Rebuild the minimal `zipsByCountyFips` index from the ZIP records. The engine
 * builds this at load time, but the Map does not survive JSON, so we reconstruct
 * exactly what `mapAlertsToZips` needs on the client.
 */
function buildZipsByCountyFips(
  zip: EmpowerZipRecord[],
): Map<string, EmpowerZipRecord[]> {
  const index = new Map<string, EmpowerZipRecord[]>();
  for (const record of zip) {
    const list = index.get(record.countyFips);
    if (list) list.push(record);
    else index.set(record.countyFips, [record]);
  }
  return index;
}

/**
 * Derive the highest active NWS severity per `county_fips` directly from the
 * parsed alerts. Each {@link NwsAlert} already lists the counties it covers
 * (`countyFips`) and its `severity`, so we keep the most severe alert touching
 * each county. Honest and simple: a county with no alert is simply absent, and
 * the choropleth treats absent as `"none"`.
 */
function deriveCountySeverity(alerts: NwsAlert[]): Map<string, Severity> {
  const byCounty = new Map<string, Severity>();
  for (const alert of alerts) {
    for (const fips of alert.countyFips) {
      const existing = byCounty.get(fips);
      if (existing === undefined || compareSeverity(alert.severity, existing) > 0) {
        byCounty.set(fips, alert.severity);
      }
    }
  }
  return byCounty;
}

export default function PlannerPage() {
  const [empower, setEmpower] =
    useState<Loadable<EmpowerDatasetWire>>(EMPTY_LOADING);
  const [alerts, setAlerts] = useState<Loadable<NwsAlert[]>>(EMPTY_LOADING);
  const [outages, setOutages] =
    useState<Loadable<SimulatedOutage[]>>(EMPTY_LOADING);

  const [stormScenario, setStormScenario] = useState(false);
  const [selectedCountyFips, setSelectedCountyFips] = useState<
    string | undefined
  >(undefined);
  const [selectedZip, setSelectedZip] = useState<string | undefined>(undefined);
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_LAYERS);
  // Storm Replay is off by default and never autoplays.
  const [replayOn, setReplayOn] = useState(false);
  const [replayHour, setReplayHour] = useState(0);

  // Storm Scenario and Storm Replay are both simulated outage sources; only one
  // runs at a time so the map never mixes two made-up storms.
  const toggleScenario = (on: boolean) => {
    setStormScenario(on);
    if (on) setReplayOn(false);
  };
  const toggleReplay = (on: boolean) => {
    setReplayOn(on);
    if (on) setStormScenario(false);
  };

  // Base layers: emPOWER + live alerts, fetched once on mount.
  useEffect(() => {
    let cancelled = false;
    void fetchEnvelope<EmpowerDatasetWire>("/api/empower").then((state) => {
      if (!cancelled) setEmpower(state);
    });
    void fetchEnvelope<NwsAlert[]>("/api/alerts").then((state) => {
      if (!cancelled) setAlerts(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Simulated outage layer: fetched only while Storm Scenario is ON.
  useEffect(() => {
    if (!stormScenario) {
      setOutages(EMPTY_LOADING);
      return;
    }
    let cancelled = false;
    setOutages(EMPTY_LOADING);
    void fetchEnvelope<SimulatedOutage[]>("/api/outages").then((state) => {
      if (!cancelled) setOutages(state);
    });
    return () => {
      cancelled = true;
    };
  }, [stormScenario]);

  const dataset = empower.value;

  // Rebuild the county→ZIPs index client-side (Maps don't survive JSON) so
  // `mapAlertsToZips` can fan alerts out to per-ZIP severities.
  const zipsByCountyFips = useMemo(
    () => (dataset ? buildZipsByCountyFips(dataset.zip) : undefined),
    [dataset],
  );

  // Highest active severity per county, for the choropleth overlay.
  const countySeverity = useMemo(
    () =>
      alerts.status === "ok" && alerts.value
        ? deriveCountySeverity(alerts.value)
        : undefined,
    [alerts],
  );

  // Highest active severity per ZIP, for the ranked list. Best-effort: a ZIP
  // with no alert defaults to "none" inside RankedList.
  const severityByZip = useMemo(() => {
    if (alerts.status !== "ok" || !alerts.value || !zipsByCountyFips) {
      return undefined;
    }
    const zipAlerts = mapAlertsToZips(alerts.value, zipsByCountyFips);
    const map = new Map<string, Severity>();
    for (const za of zipAlerts) map.set(za.zip, za.severity);
    return map;
  }, [alerts, zipsByCountyFips]);

  // Active-outage flags per ZIP, only while Storm Scenario is ON and the
  // simulated outages loaded. `outageFlagsByZip` needs the dataset's `zip`
  // array; the Map indexes are unused by it, so the wire shape is enough.
  const outageByZip = useMemo(() => {
    if (
      !stormScenario ||
      !dataset ||
      outages.status !== "ok" ||
      !outages.value
    ) {
      return undefined;
    }
    return outageFlagsByZip(
      outages.value,
      dataset as unknown as EmpowerDataset,
    );
  }, [stormScenario, dataset, outages]);

  // The current simulated replay frame (when Storm Replay is on).
  const replayFrame =
    replayOn && REPLAY
      ? REPLAY.frames[clampHour(replayHour, REPLAY.frames.length)]
      : undefined;
  const replayOutageByZip = useMemo(
    () => (replayFrame && dataset ? outageFlagsForFrame(replayFrame, dataset.zip) : undefined),
    [replayFrame, dataset],
  );
  const replayCountyStatus = useMemo(
    () => (replayFrame ? countyStatusForFrame(replayFrame) : undefined),
    [replayFrame],
  );
  const outagesSimulated = stormScenario || replayOn;

  // Layer toggles control what feeds the map AND the ranking, so what you see
  // is what is scored. Turning a layer off removes its signal from both.
  const activeSeverityByZip = layers.alerts ? severityByZip : undefined;
  const activeCountySeverity = layers.alerts ? countySeverity : undefined;
  const activeOutageByZip = layers.outages
    ? (replayOutageByZip ?? outageByZip)
    : undefined;
  const activeCountyOutage = layers.outages ? replayCountyStatus : undefined;

  // One scoring pass shared by the map circles and popups, the outreach
  // comparison, and (via the same helper) the ranked list, so all of them always
  // use the same scores and order.
  const rankedRows = useMemo(
    () => (dataset ? buildRankedRows(dataset, activeSeverityByZip, activeOutageByZip) : undefined),
    [dataset, activeSeverityByZip, activeOutageByZip],
  );
  const scores = useMemo(() => {
    if (!rankedRows) return undefined;
    const map = new Map<string, ZipScore>();
    for (const { result } of rankedRows) {
      map.set(result.zip, {
        score100: displayScore(result.score),
        reasons: result.reasons,
      });
    }
    return map;
  }, [rankedRows]);
  const priorityOrder = useMemo(
    () => rankedRows?.map((r) => r.result.zip),
    [rankedRows],
  );

  // Summary stat cards: plain counts from the loaded data and the current mode.
  // Display only; nothing here feeds scoring.
  const stats = useMemo(() => {
    const residents = dataset
      ? dataset.zip
          .reduce((sum, z) => sum + z.powerDependentDme.value, 0)
          .toLocaleString("en-US")
      : empower.status === "error"
        ? "Not available"
        : "Loading";

    const alertZips = severityByZip
      ? [...severityByZip.values()].filter((s) => s !== "none").length.toLocaleString("en-US")
      : alerts.status === "error"
        ? "Not available"
        : "Loading";

    let outageCounties: string;
    let outageNote: string;
    if (replayOn && replayCountyStatus) {
      outageCounties = String(
        [...replayCountyStatus.values()].filter((s) => s === "outage").length,
      );
      outageNote = `From the storm replay practice data, hour ${clampHour(replayHour, REPLAY?.frames.length ?? 1)}.`;
    } else if (stormScenario) {
      outageCounties =
        outages.status === "ok" && outages.value && dataset
          ? String(countOutageCounties(outages.value, dataset.zip))
          : outages.status === "error"
            ? "Not available"
            : "Loading";
      outageNote = "From the storm scenario practice data.";
    } else {
      outageCounties = "Not tracked";
      outageNote =
        "Live mode has no outage feed. Turn on the storm scenario or replay to practice.";
    }
    return { residents, alertZips, outageCounties, outageNote };
  }, [dataset, empower.status, severityByZip, alerts.status, replayOn, replayCountyStatus, replayHour, stormScenario, outages]);

  // Clicking a ZIP on the map filters the list to that ZIP's county (so its row
  // is always present) and highlights the row.
  const selectZipFromMap = (zip: string) => {
    const record = dataset?.zip.find((r) => r.zip === zip);
    if (record) setSelectedCountyFips(record.countyFips);
    setSelectedZip(zip);
  };

  // Bring the highlighted row into view after a map click.
  useEffect(() => {
    if (!selectedZip || typeof document === "undefined") return;
    const row = document.querySelector<HTMLElement>(`tr[data-zip="${selectedZip}"]`);
    row?.scrollIntoView?.({ block: "nearest" });
  }, [selectedZip, selectedCountyFips]);

  return (
    <main id="main-content" className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-3">
          <h1 className={h1Classes}>Planner dashboard</h1>
          <p className="max-w-3xl text-xl leading-relaxed text-neutral-700">
            See where power-dependent Medicare residents live across
            Massachusetts, overlaid with active weather alerts, so you can focus
            outreach where it matters most.
          </p>
          <p className="max-w-3xl text-base leading-relaxed text-neutral-600">
            Counts come from HHS emPOWER. They are aggregated, de-identified
            Medicare data, not a list of individuals. A count of &ldquo;11 or
            fewer&rdquo; means the source hid the exact number to protect
            privacy.
          </p>
        </div>

        {/* Summary stats. Plain facts from the loaded data and current mode. */}
        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="sr-only">
            Summary
          </h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={Users}
              label="Power dependent residents in MA"
              value={stats.residents}
              note="Medicare residents using electricity dependent equipment. ZIPs shown as 11 or fewer count as up to 11."
            />
            <StatCard
              icon={TriangleAlert}
              label="ZIPs with active alerts"
              value={stats.alertZips}
              note="ZIP codes in counties with an active National Weather Service alert."
            />
            <StatCard
              icon={Zap}
              label="Counties in outage"
              value={stats.outageCounties}
              note={stats.outageNote}
            />
          </dl>
        </section>

        {/* Full-width simulated banner, shown only while the scenario is on. */}
        {stormScenario && (
          <div className="flex w-full items-start gap-3 rounded-lg border border-power-edge bg-power-tint px-4 py-3 text-base font-semibold text-power-ink">
            <FlaskConical aria-hidden="true" focusable="false" className="mt-0.5 h-5 w-5 flex-none" />
            <span>
              Simulated storm scenario is on. The outage layer below is simulated
              data, not a live outage feed.
            </span>
          </div>
        )}

        {/* Data provenance for the base layers. */}
        <section
          aria-label="Data sources"
          className="flex flex-wrap items-center gap-3"
        >
          {empower.status === "ok" && empower.updatedAt && (
            <DataSourceBadge
              source="empower-aggregated-deidentified-medicare"
              updatedAt={empower.updatedAt}
            />
          )}
          {alerts.status === "ok" && alerts.updatedAt && (
            <DataSourceBadge
              source="nws-live-alert"
              updatedAt={alerts.updatedAt}
            />
          )}
        </section>

        {/* Alerts errors are surfaced honestly but do not block the map/list. */}
        {alerts.status === "error" && (
          <p role="alert" className="text-base font-semibold text-alert-red">
            Live weather alerts could not load: {alerts.errorMessage}. The map
            and list below still show the resident data.
          </p>
        )}

        {/* Base data states. */}
        {empower.status === "loading" && (
          <p className="text-base text-storm-navy">
            Loading resident data&hellip;
          </p>
        )}

        {empower.status === "error" && (
          <p role="alert" className="text-base font-semibold text-alert-red">
            The resident data could not load: {empower.errorMessage}. No data is
            shown rather than guessing.
          </p>
        )}

        {/* Sidebar (controls, layers, legend) + map. Stacked on mobile with
            the controls first; side by side on large screens. */}
        <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
        {/* Storm Scenario toggle. Off = live data only. On = add the simulated
            outage layer, badged as simulated. */}
        <section
          aria-labelledby="scenario-heading"
          className={cardClasses({ padding: "sm", className: "flex flex-col gap-3" })}
        >
          <h2
            id="scenario-heading"
            className={`flex items-center gap-2 ${h2Classes}`}
          >
            <CloudLightning aria-hidden="true" focusable="false" className="h-6 w-6 shrink-0" />
            Storm Scenario
          </h2>
          <p className={hintClasses}>
            Live data is shown by default. Turn on one practice mode at a time.
          </p>
          <div className="flex flex-col gap-2">
            <label className={toggleRowClasses}>
              <input
                type="checkbox"
                checked={stormScenario}
                onChange={(e) => toggleScenario(e.target.checked)}
                className={`mt-0.5 ${checkboxClasses}`}
              />
              <span>
                Simulate a nor&rsquo;easter with outages over Eastern
                Massachusetts
              </span>
            </label>
            {stormScenario && <SimulatedBadge label="Simulated outages" className="self-start" />}
          </div>
          {REPLAY ? (
            <label className={toggleRowClasses}>
              <input
                type="checkbox"
                checked={replayOn}
                onChange={(e) => toggleReplay(e.target.checked)}
                className={`mt-0.5 ${checkboxClasses}`}
              />
              <span>
                Show Storm Replay: a simulated 12 hour nor&rsquo;easter, hour by
                hour (Simulated)
              </span>
            </label>
          ) : (
            <p className="text-base text-storm-navy">
              The simulated Storm Replay could not load.
            </p>
          )}
          {stormScenario && outages.status === "ok" && outages.updatedAt && (
            <DataSourceBadge
              source="simulated"
              updatedAt={outages.updatedAt}
              className="self-start"
            />
          )}
          {stormScenario && outages.status === "error" && (
            <p role="alert" className="text-base font-semibold text-alert-red">
              The simulated outage layer could not load: {outages.errorMessage}
            </p>
          )}
        </section>

        {empower.status === "ok" && dataset && (
          <MapLegend
            layers={layers}
            onChange={setLayers}
            outagesSimulated={outagesSimulated}
          />
        )}
        </div>

        {empower.status === "ok" && dataset && (
            /* The map is the hero of the main column, at least 60vh tall. The
               ranked list below is the full non-map path to the same data. */
            <section
              aria-labelledby="map-heading"
              className="flex min-w-0 flex-col gap-4"
            >
              <SectionHeading id="map-heading" icon={MapIcon}>
                Massachusetts map
              </SectionHeading>
              <div className="h-[60vh] min-h-[28rem] w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card">
                <CountyChoropleth
                  dataset={dataset as unknown as EmpowerDataset}
                  countySeverity={activeCountySeverity}
                  selectedCountyFips={selectedCountyFips}
                  onSelectCounty={(fips) =>
                    setSelectedCountyFips((current) =>
                      current === fips ? undefined : fips,
                    )
                  }
                  scores={scores}
                  outageByZip={activeOutageByZip}
                  countyOutage={activeCountyOutage}
                  outagesSimulated={outagesSimulated}
                  selectedZip={selectedZip}
                  onSelectZip={selectZipFromMap}
                  layers={layers}
                />
              </div>
              <p className={hintClasses}>
                Click a county to filter the list, or a circle to see a ZIP. Two
                small ZIPs (02350 and 02661) have no Census location and appear
                only in the list.
              </p>
              {replayOn && REPLAY && (
                <StormReplay
                  file={REPLAY}
                  zips={dataset.zip}
                  hour={replayHour}
                  onHourChange={setReplayHour}
                  priorityOrder={priorityOrder}
                />
              )}
            </section>
        )}
        </div>

        {empower.status === "ok" && dataset && (
            /* Ranked list: the accessible non-map path to the same data. */
            <section
              aria-labelledby="ranked-heading"
              className={cardClasses({ className: "flex flex-col gap-4" })}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2
                  id="ranked-heading"
                  className={`flex items-center gap-2 ${h2Classes}`}
                >
                  <ListOrdered aria-hidden="true" focusable="false" className="h-6 w-6 shrink-0" />
                  Outreach priority
                  {selectedCountyFips ? ` (county ${selectedCountyFips})` : ""}
                </h2>
                {selectedCountyFips && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSelectedCountyFips(undefined);
                      setSelectedZip(undefined);
                    }}
                  >
                    <X aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" />
                    Show all counties
                  </Button>
                )}
              </div>
              <RankedList
                dataset={dataset as unknown as EmpowerDataset}
                severityByZip={activeSeverityByZip}
                outageByZip={activeOutageByZip}
                countyFips={selectedCountyFips}
                limit={100}
                selectedZip={selectedZip}
                onSelectZip={setSelectedZip}
              />
            </section>
        )}
      </div>
    </main>
  );
}
