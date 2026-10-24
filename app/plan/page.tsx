"use client";

// app/plan/page.tsx
//
// Resident page (`/plan`). Mobile-first, client-rendered because it reads and
// writes localStorage, uses the Web Share / Clipboard APIs, and switches
// language on the fly. It sits entirely on top of the completed engine and the
// `lib/app` helpers — it never re-implements loaders, scoring, or battery math.
//
// Honesty + safety are structural here:
//   * The battery timeline is computed by the engine's `batteryTimeline` and
//     rendered through the card, always labeled "based on what you entered".
//   * Alerts are shown exactly as `/api/alerts` returns them; on error we show
//     a plain message and never fabricate an alert.
//   * Resident data (ZIP, devices, battery hours, contacts) lives only in the
//     browser via `usePlanStorage`. Only the ZIP is sent to the server.
//   * With no AI key the page still renders complete English copy: it defaults
//     to `resolveCopy(plan.language)` and only overlays the `/api/translate`
//     result when it arrives.
//
// Accessibility (WCAG 2.2 AA): every input has an associated `<label>`, the
// battery-hours error is tied to its input via `aria-describedby`, the alerts
// region is a polite live region, controls are >= 44px tall, and a print
// stylesheet hides the form so only the card prints.
//
// _Requirements: 4.1, 4.2, 4.4, 4.6, 5.1, 5.6, 5.7, 5.8, 5.9, 6.3, 6.9, 9.1_

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  usePlanStorage,
  isValidBatteryHours,
  MAX_CONTACTS,
  type ResidentPlan,
  type SupportedLanguage,
} from "@/lib/app/plan-storage";
import { resolveCopy, type ResolvedCopy } from "@/lib/app/copy/resolve";
import { buildShareText } from "@/lib/app/share";
// Import only pure engine code into this client bundle. The engine barrel
// (`@/lib/risk-engine`) re-exports server-only filesystem loaders that use
// `node:fs`, so a client component must not pull it in at runtime. The battery
// core is pure; `Timeline` and `NwsAlert` are type-only and are erased.
import { batteryTimeline } from "@/lib/risk-engine/battery";
import type { Timeline } from "@/lib/risk-engine/battery";
import type { NwsAlert } from "@/lib/risk-engine/alert-loader";

import LanguagePicker from "@/components/LanguagePicker";
import OutagePlanCard from "@/components/OutagePlanCard";
import DataSourceBadge from "@/components/DataSourceBadge";

/** The fixed list of device types a resident can depend on. */
const DEVICE_TYPES: readonly string[] = [
  "Oxygen concentrator",
  "Home dialysis",
  "Ventilator",
  "Powered wheelchair",
  "Other",
];

/** A valid US ZIP is exactly five digits for our MA lookups. */
function isValidZip(zip: string): boolean {
  return /^\d{5}$/.test(zip.trim());
}

/** The empty plan a first-time resident starts from. */
const INITIAL_PLAN: ResidentPlan = {
  zip: "",
  deviceTypes: [],
  batteryHours: 0,
  contacts: [],
  language: "en",
};

/** Shape of the `/api/alerts` success envelope we consume. */
interface AlertsEnvelope {
  ok: boolean;
  value?: NwsAlert[];
  source?: string;
  updatedAt?: string;
  error?: { code: string; message: string };
}

/** The current status of the live-alerts fetch. */
type AlertsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; alerts: NwsAlert[]; source: string; updatedAt: string };

/** Format a `datetime-local` value from an epoch-ms time, in local time. */
function toDatetimeLocal(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export default function PlanPage() {
  const [plan, setPlan] = usePlanStorage(INITIAL_PLAN);

  // Resolved copy. Default to the client-side resolver so the page renders
  // complete (English + fixed strings) even before — or entirely without — the
  // /api/translate fetch. The server result overlays this when it arrives.
  const [resolvedCopy, setResolvedCopy] = useState<ResolvedCopy>(() =>
    resolveCopy(plan.language),
  );

  // Raw text the resident has typed for battery hours, kept separate from the
  // stored number so we can show an inline validation prompt for bad input.
  const [batteryHoursText, setBatteryHoursText] = useState<string>(
    String(plan.batteryHours),
  );

  // The chosen outage-start time (epoch ms), defaulting to "now".
  const [outageStart, setOutageStart] = useState<number>(() => Date.now());

  const [alertsState, setAlertsState] = useState<AlertsState>({
    status: "idle",
  });

  // When the language changes, ask the server for translated copy. The route
  // always succeeds (English templates are the floor), but if the fetch fails
  // entirely we keep the client-resolved copy so the page never breaks.
  useEffect(() => {
    let cancelled = false;
    // Seed with the client resolver immediately so switching language is never
    // blank while the request is in flight.
    setResolvedCopy(resolveCopy(plan.language));

    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: plan.language }),
    })
      .then((res) => res.json())
      .then((data: { ok?: boolean; copy?: ResolvedCopy }) => {
        if (cancelled) return;
        if (data && data.ok && data.copy) {
          setResolvedCopy(data.copy);
        }
      })
      .catch(() => {
        // Keep the client-resolved copy; the page stays fully functional.
      });

    return () => {
      cancelled = true;
    };
  }, [plan.language]);

  // Fetch live alerts once a valid ZIP is present. Alert→ZIP mapping is
  // county-level, so we honestly show all active MA alerts with a note.
  useEffect(() => {
    if (!isValidZip(plan.zip)) {
      setAlertsState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setAlertsState({ status: "loading" });

    fetch("/api/alerts")
      .then(async (res) => {
        const data = (await res.json()) as AlertsEnvelope;
        if (cancelled) return;
        if (!res.ok || !data.ok || !data.value) {
          setAlertsState({
            status: "error",
            message:
              "We could not load storm alerts right now. Please check the National Weather Service for current alerts.",
          });
          return;
        }
        setAlertsState({
          status: "loaded",
          alerts: data.value,
          source: data.source ?? "nws-live-alert",
          updatedAt: data.updatedAt ?? new Date().toISOString(),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setAlertsState({
          status: "error",
          message:
            "We could not load storm alerts right now. Please check the National Weather Service for current alerts.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [plan.zip]);

  // The battery hours entered are only valid when non-negative and finite.
  const batteryHoursValid = useMemo(() => {
    const trimmed = batteryHoursText.trim();
    if (trimmed === "") return false;
    const parsed = Number(trimmed);
    return isValidBatteryHours(parsed);
  }, [batteryHoursText]);

  // Compute the battery timeline from the stored hours and the chosen start.
  const timeline: Timeline | null = useMemo(() => {
    const result = batteryTimeline(plan.batteryHours, outageStart);
    return result.ok ? result.value : null;
  }, [plan.batteryHours, outageStart]);

  const atContactLimit = plan.contacts.length >= MAX_CONTACTS;

  // --- Controlled-field handlers --------------------------------------------

  const handleZipChange = useCallback(
    (value: string) => {
      setPlan((prev) => ({ ...prev, zip: value }));
    },
    [setPlan],
  );

  const toggleDevice = useCallback(
    (device: string) => {
      setPlan((prev) => {
        const has = prev.deviceTypes.includes(device);
        return {
          ...prev,
          deviceTypes: has
            ? prev.deviceTypes.filter((d) => d !== device)
            : [...prev.deviceTypes, device],
        };
      });
    },
    [setPlan],
  );

  const handleBatteryHoursChange = useCallback(
    (value: string) => {
      setBatteryHoursText(value);
      const parsed = Number(value.trim());
      // Only persist a valid, non-negative number; otherwise leave the stored
      // value untouched so the card never reflects rejected input.
      if (value.trim() !== "" && isValidBatteryHours(parsed)) {
        setPlan((prev) => ({ ...prev, batteryHours: parsed }));
      }
    },
    [setPlan],
  );

  const handleLanguageChange = useCallback(
    (lang: SupportedLanguage) => {
      setPlan((prev) => ({ ...prev, language: lang }));
    },
    [setPlan],
  );

  const addContact = useCallback(() => {
    setPlan((prev) => {
      if (prev.contacts.length >= MAX_CONTACTS) return prev;
      return { ...prev, contacts: [...prev.contacts, { name: "", phone: "" }] };
    });
  }, [setPlan]);

  const updateContact = useCallback(
    (index: number, field: "name" | "phone", value: string) => {
      setPlan((prev) => ({
        ...prev,
        contacts: prev.contacts.map((c, i) =>
          i === index ? { ...c, [field]: value } : c,
        ),
      }));
    },
    [setPlan],
  );

  const removeContact = useCallback(
    (index: number) => {
      setPlan((prev) => ({
        ...prev,
        contacts: prev.contacts.filter((_, i) => i !== index),
      }));
    },
    [setPlan],
  );

  // --- Share / print --------------------------------------------------------

  const [shareNote, setShareNote] = useState<string>("");

  const handleShare = useCallback(async () => {
    const text = buildShareText(plan);
    // Prefer the native share sheet when the browser supports it.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // User dismissed or share failed; fall through to copy below.
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setShareNote("Plan copied. You can paste it into a message.");
        return;
      } catch {
        // Clipboard blocked; leave a plain fallback note.
      }
    }
    setShareNote("Use Print to save or share your plan.");
  }, [plan]);

  const handlePrint = useCallback(() => {
    if (typeof window !== "undefined") {
      window.print();
    }
  }, []);

  const zipValid = isValidZip(plan.zip);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-8">
      {/* Print stylesheet: hide controls and show only the card when printing. */}
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          .print-only-card { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-gray-900">
          {resolvedCopy.catalog["page.title"]}
        </h1>
        <p className="text-base leading-relaxed text-gray-900">
          {resolvedCopy.catalog["page.intro"]}
        </p>
      </header>

      {/* Language picker (does not print). */}
      <div className="print-hide">
        <LanguagePicker
          value={plan.language}
          onChange={handleLanguageChange}
          label={resolvedCopy.catalog["form.language.label"]}
        />
      </div>

      {/* The input form. Hidden on print so only the plan card prints. */}
      <form
        className="print-hide flex flex-col gap-6"
        onSubmit={(e) => e.preventDefault()}
      >
        <h2 className="text-xl font-semibold text-gray-900">
          Tell us about your power needs
        </h2>

        {/* ZIP */}
        <div className="flex flex-col gap-1">
          <label htmlFor="zip" className="text-sm font-medium text-gray-900">
            {resolvedCopy.catalog["form.zip.label"]}
          </label>
          <input
            id="zip"
            name="zip"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            value={plan.zip}
            onChange={(e) => handleZipChange(e.target.value)}
            aria-describedby="zip-hint"
            className="min-h-[44px] rounded border border-gray-400 bg-white px-3 py-2 text-base text-gray-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700"
          />
          <p id="zip-hint" className="text-sm text-gray-700">
            Enter your 5-digit ZIP code. Only your ZIP is sent to look up alerts.
          </p>
        </div>

        {/* Device types */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-gray-900">
            {resolvedCopy.catalog["form.deviceTypes.label"]}
          </legend>
          <div className="flex flex-col gap-2">
            {DEVICE_TYPES.map((device) => {
              const id = `device-${device.replace(/\s+/g, "-").toLowerCase()}`;
              return (
                <label
                  key={device}
                  htmlFor={id}
                  className="flex min-h-[44px] items-center gap-3 text-base text-gray-900"
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={plan.deviceTypes.includes(device)}
                    onChange={() => toggleDevice(device)}
                    className="h-5 w-5 rounded border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                  {device}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Backup battery hours */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="battery-hours"
            className="text-sm font-medium text-gray-900"
          >
            {resolvedCopy.catalog["form.batteryHours.label"]}
          </label>
          <input
            id="battery-hours"
            name="battery-hours"
            type="number"
            min={0}
            step="0.5"
            inputMode="decimal"
            value={batteryHoursText}
            onChange={(e) => handleBatteryHoursChange(e.target.value)}
            aria-invalid={!batteryHoursValid}
            aria-describedby={
              batteryHoursValid ? undefined : "battery-hours-error"
            }
            className="min-h-[44px] rounded border border-gray-400 bg-white px-3 py-2 text-base text-gray-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700"
          />
          {!batteryHoursValid ? (
            <p
              id="battery-hours-error"
              role="alert"
              className="text-sm font-medium text-red-700"
            >
              Enter the number of hours your backup battery lasts. Use 0 or more.
            </p>
          ) : null}
        </div>

        {/* Emergency contacts */}
        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-gray-900">
            Emergency contacts (up to {MAX_CONTACTS})
          </legend>

          {plan.contacts.map((contact, index) => (
            <div
              key={index}
              className="flex flex-col gap-2 rounded border border-gray-300 p-3"
            >
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`contact-name-${index}`}
                  className="text-sm font-medium text-gray-900"
                >
                  {resolvedCopy.catalog["form.contactName.label"]}
                </label>
                <input
                  id={`contact-name-${index}`}
                  type="text"
                  autoComplete="name"
                  value={contact.name}
                  onChange={(e) => updateContact(index, "name", e.target.value)}
                  className="min-h-[44px] rounded border border-gray-400 bg-white px-3 py-2 text-base text-gray-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`contact-phone-${index}`}
                  className="text-sm font-medium text-gray-900"
                >
                  {resolvedCopy.catalog["form.contactPhone.label"]}
                </label>
                <input
                  id={`contact-phone-${index}`}
                  type="tel"
                  autoComplete="tel"
                  value={contact.phone}
                  onChange={(e) =>
                    updateContact(index, "phone", e.target.value)
                  }
                  className="min-h-[44px] rounded border border-gray-400 bg-white px-3 py-2 text-base text-gray-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700"
                />
              </div>
              <button
                type="button"
                onClick={() => removeContact(index)}
                className="min-h-[44px] self-start rounded border border-gray-400 px-4 py-2 text-base text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                Remove this contact
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addContact}
            disabled={atContactLimit}
            aria-describedby={atContactLimit ? "contact-limit-note" : undefined}
            className="min-h-[44px] self-start rounded bg-blue-700 px-4 py-2 text-base font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {resolvedCopy.catalog["form.addContact.label"]}
          </button>
          {atContactLimit ? (
            <p id="contact-limit-note" role="status" className="text-sm text-gray-700">
              You can add up to {MAX_CONTACTS} contacts.
            </p>
          ) : null}
        </fieldset>

        {/* Outage-start control for the battery timeline */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="outage-start"
            className="text-sm font-medium text-gray-900"
          >
            If power goes out at
          </label>
          <input
            id="outage-start"
            type="datetime-local"
            value={toDatetimeLocal(outageStart)}
            onChange={(e) => {
              const parsed = new Date(e.target.value).getTime();
              if (!Number.isNaN(parsed)) setOutageStart(parsed);
            }}
            className="min-h-[44px] rounded border border-gray-400 bg-white px-3 py-2 text-base text-gray-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700"
          />
          <p className="text-sm text-gray-700">
            Defaults to now. Your battery timeline is based on what you entered.
          </p>
        </div>
      </form>

      {/* Live storm alerts for the area (shown once a valid ZIP is present). */}
      <section
        aria-labelledby="alerts-heading"
        className="print-hide flex flex-col gap-3"
      >
        <h2 id="alerts-heading" className="text-xl font-semibold text-gray-900">
          Storm alerts for your area
        </h2>
        <div aria-live="polite" className="flex flex-col gap-3">
          {!zipValid ? (
            <p className="text-base text-gray-700">
              Enter your ZIP code to see active storm alerts.
            </p>
          ) : alertsState.status === "loading" ? (
            <p className="text-base text-gray-700">Loading storm alerts…</p>
          ) : alertsState.status === "error" ? (
            <p className="text-base text-red-700">{alertsState.message}</p>
          ) : alertsState.status === "loaded" ? (
            <>
              <DataSourceBadge
                source={alertsState.source}
                updatedAt={alertsState.updatedAt}
              />
              <p className="text-sm text-gray-700">
                Alerts are matched at the county level, so these are the active
                Massachusetts alerts that may affect your area.
              </p>
              {alertsState.alerts.length === 0 ? (
                <p className="text-base text-gray-900">
                  No active storm alerts right now.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {alertsState.alerts.map((alert) => (
                    <li
                      key={alert.id}
                      className="rounded border border-gray-300 bg-gray-50 p-3"
                    >
                      <p className="font-medium text-gray-900">
                        {alert.headline ?? "Weather alert"}
                      </p>
                      <p className="text-sm text-gray-800">
                        Severity: {alert.severity}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      </section>

      {/* The resident's Outage Plan card. */}
      <section aria-labelledby="card-heading" className="flex flex-col gap-4">
        <h2 id="card-heading" className="sr-only">
          Your outage plan
        </h2>
        <OutagePlanCard
          plan={plan}
          copy={resolvedCopy}
          timeline={timeline}
          className="print-only-card"
        />

        {/* Share / copy / print controls (do not print). */}
        <div className="print-hide flex flex-col gap-2">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleShare}
              className="min-h-[44px] rounded bg-blue-700 px-5 py-2 text-base font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2"
            >
              {resolvedCopy.catalog["action.share"]}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[44px] rounded border border-blue-700 bg-white px-5 py-2 text-base font-medium text-blue-800 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2"
            >
              {resolvedCopy.catalog["action.print"]}
            </button>
          </div>
          {shareNote ? (
            <p role="status" className="text-sm text-gray-700">
              {shareNote}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
