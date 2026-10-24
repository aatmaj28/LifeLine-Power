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

import DataSourceBadge from "@/components/DataSourceBadge";
import RankedList from "@/components/RankedList";
import SimulatedBadge from "@/components/SimulatedBadge";
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

  return (
    <main className="flex min-h-screen flex-col">
      {/* Navy page header, consistent with the landing page. */}
      <header className="bg-storm-navy">
        <div className="mx-auto w-full max-w-7xl px-4 py-5">
          <h1 className="text-3xl font-bold text-white">Planner dashboard</h1>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-2">
          <p className="max-w-3xl text-base leading-relaxed text-storm-navy">
            See where power-dependent Medicare residents live across
            Massachusetts, overlaid with active weather alerts, so you can focus
            outreach where it matters most.
          </p>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
            Counts come from HHS emPOWER. They are aggregated, de-identified
            Medicare data, not a list of individuals. A count of &ldquo;11 or
            fewer&rdquo; means the source hid the exact number to protect
            privacy.
          </p>
        </div>

        {/* Storm Scenario toggle. Off = live data only. On = add the simulated
            outage layer, badged as simulated. */}
        <section
          aria-labelledby="scenario-heading"
          className="flex flex-col gap-3 rounded-lg border border-slate-300 bg-white p-4"
        >
          <h2
            id="scenario-heading"
            className="text-lg font-semibold text-storm-navy"
          >
            Storm Scenario
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-[44px] items-center gap-3 text-base text-storm-navy">
              <input
                type="checkbox"
                checked={stormScenario}
                onChange={(e) => setStormScenario(e.target.checked)}
                className="h-6 w-6 rounded border-slate-400 text-power-amber focus-visible:outline-none"
              />
              <span>
                Simulate a nor&rsquo;easter with outages over Eastern
                Massachusetts
              </span>
            </label>
            {stormScenario && <SimulatedBadge label="Simulated outages" />}
          </div>
          {stormScenario && outages.status === "ok" && outages.updatedAt && (
            <DataSourceBadge
              source="simulated"
              updatedAt={outages.updatedAt}
              className="self-start"
            />
          )}
          {stormScenario && outages.status === "error" && (
            <p role="alert" className="text-base text-alert-red">
              The simulated outage layer could not load: {outages.errorMessage}
            </p>
          )}
        </section>

        {/* Full-width simulated banner, shown only while the scenario is on. */}
        {stormScenario && (
          <div className="w-full rounded-lg border border-power-amber bg-power-amber/15 px-4 py-3 text-base font-medium text-storm-navy">
            Simulated storm scenario is on. The outage layer below is simulated
            data, not a live outage feed.
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
          <p role="alert" className="text-base text-alert-red">
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
          <p role="alert" className="text-base text-alert-red">
            The resident data could not load: {empower.errorMessage}. No data is
            shown rather than guessing.
          </p>
        )}

        {empower.status === "ok" && dataset && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Map view (left on wide screens). The ranked list is the full
                non-map alternative. */}
            <section
              aria-labelledby="map-heading"
              className="flex flex-col gap-3"
            >
              <h2
                id="map-heading"
                className="text-xl font-semibold text-storm-navy"
              >
                County map
              </h2>
              <div className="h-[32rem] w-full overflow-hidden rounded-lg border border-slate-300 lg:h-[40rem]">
                <CountyChoropleth
                  dataset={dataset as unknown as EmpowerDataset}
                  countySeverity={countySeverity}
                  selectedCountyFips={selectedCountyFips}
                  onSelectCounty={(fips) =>
                    setSelectedCountyFips((current) =>
                      current === fips ? undefined : fips,
                    )
                  }
                />
              </div>
              {selectedCountyFips && (
                <button
                  type="button"
                  onClick={() => setSelectedCountyFips(undefined)}
                  className="inline-flex min-h-[44px] w-fit items-center rounded border border-slate-400 bg-white px-4 py-2 text-base text-storm-navy hover:bg-mist focus-visible:outline-none"
                >
                  Show all counties
                </button>
              )}
            </section>

            {/* Ranked list (right on wide screens): the non-map path to the
                same outreach-priority data. */}
            <section
              aria-labelledby="ranked-heading"
              className="flex flex-col gap-3"
            >
              <h2
                id="ranked-heading"
                className="text-xl font-semibold text-storm-navy"
              >
                Outreach priority
                {selectedCountyFips ? ` (county ${selectedCountyFips})` : ""}
              </h2>
              <RankedList
                dataset={dataset as unknown as EmpowerDataset}
                severityByZip={severityByZip}
                outageByZip={outageByZip}
                countyFips={selectedCountyFips}
                limit={100}
              />
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
