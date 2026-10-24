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
import { formatBatteryTimeline } from "@/lib/app/battery-format";
import { decodePlanHash, planLink, PLAN_HASH_KEY } from "@/lib/app/plan-hash";
import QRCode from "qrcode";
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
import ReadAloud from "@/components/ReadAloud";
import FridgeCard, { QR_TRUST_NOTE } from "@/components/FridgeCard";
import { Button } from "@/components/ui/Button";
import { cardClasses } from "@/components/ui/Card";
import {
  Field,
  checkboxClasses,
  hintClasses,
  inputClasses,
  labelClasses,
} from "@/components/ui/Field";
import { SectionHeading, h1Classes, h2Classes } from "@/components/ui/SectionHeading";
import {
  CloudLightning,
  Info,
  Plus,
  Printer,
  QrCode,
  Share2,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

/**
 * One numbered step of the resident form. The visible number is decorative;
 * the heading carries "Step N of 4" for screen readers.
 */
function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  const headingId = `step-${n}-heading`;
  return (
    <section aria-labelledby={headingId} className={cardClasses({ className: "flex flex-col gap-5" })}>
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-storm-navy text-lg font-bold text-white"
        >
          {n}
        </span>
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className={h2Classes}>
            <span className="sr-only">Step {n} of 4: </span>
            {title}
          </h2>
          <p className={hintClasses}>{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Severity styling for an alert card. The "Severity: X" text carries the meaning. */
function alertTone(severity: string): { icon: LucideIcon; icon_color: string; card: string } {
  switch (severity) {
    case "Extreme":
    case "Severe":
      return { icon: TriangleAlert, icon_color: "text-alert-red", card: "border-l-alert-red bg-alert-tint" };
    case "Moderate":
      return { icon: CloudLightning, icon_color: "text-power-ink", card: "border-l-power-amber bg-power-tint" };
    default:
      return { icon: Info, icon_color: "text-storm-navy", card: "border-l-neutral-400 bg-white" };
  }
}

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

  // Battery sentence in the selected language and in English (read-aloud
  // fallback), always labeled "based on what you entered".
  const englishCopy = useMemo(() => resolveCopy("en"), []);
  const timelineText = timeline
    ? formatBatteryTimeline(timeline, { basedOnInputLabel: resolvedCopy.basedOnInputLabel })
    : null;
  const englishTimelineText = timeline
    ? formatBatteryTimeline(timeline, { basedOnInputLabel: englishCopy.basedOnInputLabel })
    : null;

  // Keep the battery-hours text box in step when the stored plan changes from
  // outside typing (restored from localStorage or from a fridge-card code).
  // Typing an invalid value never changes the plan, so it is never overwritten.
  useEffect(() => {
    setBatteryHoursText((text) =>
      Number(text.trim()) === plan.batteryHours && text.trim() !== ""
        ? text
        : String(plan.batteryHours),
    );
  }, [plan.batteryHours]);

  // Restore a plan from a fridge-card QR link (/plan#plan=...). The fragment is
  // never sent to a server. After restoring we remove it from the address bar
  // so the plan is not left in browser history or bookmarks.
  const [restoreNote, setRestoreNote] = useState("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash.includes(`${PLAN_HASH_KEY}=`)) return;
    const restored = decodePlanHash(hash);
    if (restored) {
      setPlan(restored);
      setRestoreNote(
        "Your plan was loaded from a fridge card code. It is now saved in this browser only.",
      );
    } else {
      setRestoreNote("That plan code could not be read, so your saved plan is shown.");
    }
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [setPlan]);

  // QR code for the fridge card, made locally in the browser.
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    QRCode.toDataURL(planLink(window.location.origin, plan), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 380,
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [plan]);

  // Which layout to print: the full plan card (default) or the fridge card.
  const [printMode, setPrintMode] = useState<"default" | "fridge">("default");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reset = () => setPrintMode("default");
    window.addEventListener("afterprint", reset);
    return () => window.removeEventListener("afterprint", reset);
  }, []);
  const printFridgeCard = useCallback(() => {
    setPrintMode("fridge");
    // Let React render the fridge layout before opening the print dialog.
    setTimeout(() => {
      if (typeof window !== "undefined") window.print();
    }, 50);
  }, []);

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
    <main id="main-content" className="flex flex-1 flex-col" data-print={printMode}>
      {/* Print stylesheet: hide controls and show only the card when printing.
          In fridge mode, print only the one-page fridge card. */}
      <style>{`
        .fridge-print { display: none; }
        @media print {
          .print-hide { display: none !important; }
          .print-only-card { box-shadow: none !important; border: none !important; }
          [data-print="fridge"] .print-default { display: none !important; }
          [data-print="fridge"] .fridge-print { display: block !important; }
          @page { margin: 0.4in; }
        }
      `}</style>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="print-default flex max-w-3xl flex-col gap-3">
            <h1 className={h1Classes}>
              {resolvedCopy.catalog["page.title"]}
            </h1>
            <p className="text-xl leading-relaxed text-neutral-700">
              {resolvedCopy.catalog["page.intro"]}
            </p>
          </div>

          {/* Language picker (does not print). */}
          <div className="print-hide w-full sm:max-w-xs">
            <LanguagePicker
              value={plan.language}
              onChange={handleLanguageChange}
              label={resolvedCopy.catalog["form.language.label"]}
            />
          </div>
        </div>

        {restoreNote ? (
          <p
            role="status"
            className="print-hide flex items-start gap-3 rounded-lg border border-neutral-200 border-l-4 border-l-storm-navy bg-white px-4 py-3 text-base text-storm-navy shadow-card"
          >
            <Info aria-hidden="true" focusable="false" className="mt-0.5 h-5 w-5 flex-none" />
            <span>{restoreNote}</span>
          </p>
        ) : null}

        {/* Two columns on desktop. DOM order (form, alerts, card, fridge)
            is the reading, tab and mobile order; grid placement moves the
            card into a sticky right column on large screens only. */}
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        {/* The input form. Hidden on print so only the plan card prints. */}
        <form
          className="print-hide flex min-w-0 flex-col gap-5 lg:col-start-1"
          onSubmit={(e) => e.preventDefault()}
        >
          {/* Step 1: ZIP */}
          <Step n={1} title="Your ZIP code" hint="We use it to find storm alerts near you.">
            <Field
              htmlFor="zip"
              label={resolvedCopy.catalog["form.zip.label"]}
              hint="Enter your 5-digit ZIP code. Only your ZIP is sent to look up alerts."
              hintId="zip-hint"
            >
              <input
                id="zip"
                name="zip"
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                value={plan.zip}
                onChange={(e) => handleZipChange(e.target.value)}
                aria-describedby="zip-hint"
                className={`${inputClasses} sm:max-w-xs`}
              />
            </Field>
          </Step>

          {/* Step 2: Devices */}
          <Step n={2} title="Your devices" hint="Choose every device that needs power.">
            <fieldset className="flex flex-col gap-3">
              <legend className={`mb-1 ${labelClasses}`}>
                {resolvedCopy.catalog["form.deviceTypes.label"]}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {DEVICE_TYPES.map((device) => {
                  const id = `device-${device
                    .replace(/\s+/g, "-")
                    .toLowerCase()}`;
                  return (
                    <label
                      key={device}
                      htmlFor={id}
                      className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-lg border-2 border-neutral-300 bg-white px-4 py-3 text-lg text-storm-navy transition-colors hover:border-storm-navy has-[:checked]:border-storm-navy has-[:checked]:bg-mist motion-reduce:transition-none"
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={plan.deviceTypes.includes(device)}
                        onChange={() => toggleDevice(device)}
                        className={checkboxClasses}
                      />
                      {device}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </Step>

          {/* Step 3: Backup battery + outage start */}
          <Step n={3} title="Backup battery" hint="Tell us how long your battery lasts. We show when it may run out.">
            <Field
              htmlFor="battery-hours"
              label={resolvedCopy.catalog["form.batteryHours.label"]}
              error={
                batteryHoursValid
                  ? undefined
                  : "Enter the number of hours your backup battery lasts. Use 0 or more."
              }
              errorId="battery-hours-error"
            >
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
                className={`${inputClasses} sm:max-w-xs`}
              />
            </Field>

            {/* Outage-start control for the battery timeline */}
            <Field
              htmlFor="outage-start"
              label="If power goes out at"
              hint="Defaults to now. Your battery timeline is based on what you entered."
              hintId="outage-start-hint"
            >
              <input
                id="outage-start"
                type="datetime-local"
                value={toDatetimeLocal(outageStart)}
                onChange={(e) => {
                  const parsed = new Date(e.target.value).getTime();
                  if (!Number.isNaN(parsed)) setOutageStart(parsed);
                }}
                aria-describedby="outage-start-hint"
                className={`${inputClasses} sm:max-w-sm`}
              />
            </Field>
          </Step>

          {/* Step 4: Emergency contacts */}
          <Step n={4} title="Emergency contacts" hint="People to call if the power goes out. Names and numbers stay on this device.">
            <fieldset className="flex flex-col gap-4">
              <legend className={`mb-1 ${labelClasses}`}>
                Emergency contacts (up to {MAX_CONTACTS})
              </legend>

              {plan.contacts.map((contact, index) => (
                <div
                  key={index}
                  className="grid gap-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-2"
                >
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`contact-name-${index}`}
                      className={labelClasses}
                    >
                      {resolvedCopy.catalog["form.contactName.label"]}
                    </label>
                    <input
                      id={`contact-name-${index}`}
                      type="text"
                      autoComplete="name"
                      value={contact.name}
                      onChange={(e) =>
                        updateContact(index, "name", e.target.value)
                      }
                      className={inputClasses}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor={`contact-phone-${index}`}
                      className={labelClasses}
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
                      className={inputClasses}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => removeContact(index)}
                    className="justify-self-start sm:col-span-2"
                  >
                    <Trash2 aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" />
                    Remove this contact
                  </Button>
                </div>
              ))}

              <Button
                variant="secondary"
                onClick={addContact}
                disabled={atContactLimit}
                aria-describedby={
                  atContactLimit ? "contact-limit-note" : undefined
                }
                className="self-start"
              >
                <Plus aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" />
                {resolvedCopy.catalog["form.addContact.label"]}
              </Button>
              {atContactLimit ? (
                <p
                  id="contact-limit-note"
                  role="status"
                  className={hintClasses}
                >
                  You can add up to {MAX_CONTACTS} contacts.
                </p>
              ) : null}
            </fieldset>
          </Step>
        </form>

        {/* Live storm alerts for the area (shown once a valid ZIP is present). */}
        <section
          aria-labelledby="alerts-heading"
          className={cardClasses({ className: "print-hide flex min-w-0 flex-col gap-4 lg:col-start-1" })}
        >
          <SectionHeading id="alerts-heading" icon={CloudLightning}>
            Storm alerts for your area
          </SectionHeading>
          <div aria-live="polite" className="flex flex-col gap-3">
            {!zipValid ? (
              <p className="text-base text-neutral-600">
                Enter your ZIP code to see active storm alerts.
              </p>
            ) : alertsState.status === "loading" ? (
              <p className="text-base text-neutral-600">Loading storm alerts…</p>
            ) : alertsState.status === "error" ? (
              <p className="text-base text-alert-red">{alertsState.message}</p>
            ) : alertsState.status === "loaded" ? (
              <>
                <DataSourceBadge
                  source={alertsState.source}
                  updatedAt={alertsState.updatedAt}
                />
                <p className="text-sm text-neutral-600">
                  Alerts are matched at the county level, so these are the
                  active Massachusetts alerts that may affect your area.
                </p>
                {alertsState.alerts.length === 0 ? (
                  <p className="text-base text-storm-navy">
                    No active storm alerts right now.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {alertsState.alerts.map((alert) => {
                      const tone = alertTone(alert.severity);
                      const Icon = tone.icon;
                      return (
                        <li
                          key={alert.id}
                          className={`flex items-start gap-3 rounded-lg border border-neutral-200 border-l-[6px] p-4 shadow-card ${tone.card}`}
                        >
                          <Icon aria-hidden="true" focusable="false" className={`mt-0.5 h-6 w-6 flex-none ${tone.icon_color}`} />
                          <div className="flex flex-col gap-1">
                            <p className="text-lg font-bold leading-snug text-storm-navy">
                              {alert.headline ?? "Weather alert"}
                            </p>
                            <p className="text-base font-semibold text-storm-navy">
                              Severity: {alert.severity}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : null}
          </div>
        </section>

        {/* The resident's Outage Plan card. */}
        <section
          aria-labelledby="card-heading"
          className="print-default flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pb-2 print:static print:max-h-none print:overflow-visible"
        >
          <h2 id="card-heading" className="sr-only">
            Your outage plan
          </h2>
          <ReadAloud
            className="print-hide"
            plan={plan}
            copy={resolvedCopy}
            englishCopy={englishCopy}
            timelineText={timelineText}
            englishTimelineText={englishTimelineText}
          />
          <OutagePlanCard
            plan={plan}
            copy={resolvedCopy}
            timeline={timeline}
            className="print-only-card"
          />

          {/* Share / copy / print controls (do not print). */}
          <div className="print-hide flex flex-col gap-2">
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" onClick={handleShare}>
                <Share2 aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" />
                {resolvedCopy.catalog["action.share"]}
              </Button>
              <Button variant="secondary" onClick={handlePrint}>
                <Printer aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" />
                {resolvedCopy.catalog["action.print"]}
              </Button>
            </div>
            {shareNote ? (
              <p role="status" className={hintClasses}>
                {shareNote}
              </p>
            ) : null}
          </div>
        </section>

        {/* Fridge card: screen controls (do not print). */}
        <section
          aria-labelledby="fridge-heading"
          className={cardClasses({ className: "print-hide flex min-w-0 flex-col gap-4 lg:col-start-1" })}
        >
          <SectionHeading id="fridge-heading" icon={QrCode}>
            Fridge card
          </SectionHeading>
          <p className="text-base leading-relaxed text-storm-navy">
            Print a one-page card with large text to keep on your fridge. Scan the
            code with a phone to open this plan.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR code that opens this plan on a phone"
                width={160}
                height={160}
                className="h-40 w-40 rounded-md border border-neutral-300 bg-white p-1 shadow-card"
              />
            ) : null}
            <p className="max-w-xs text-base font-semibold text-storm-navy">
              {QR_TRUST_NOTE}
            </p>
          </div>
          <p className={hintClasses}>
            The plan is stored in the part of the link after &ldquo;#&rdquo;, which
            is never sent to a server.
          </p>
          <Button variant="secondary" onClick={printFridgeCard} className="self-start">
            <Printer aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" />
            Print fridge card
          </Button>
        </section>
        </div>

        {/* Fridge card: print-only layout. */}
        <div className="fridge-print">
          <FridgeCard
            plan={plan}
            copy={resolvedCopy}
            timeline={timeline}
            timelineText={timelineText}
            qrDataUrl={qrDataUrl}
          />
        </div>
      </div>
    </main>
  );
}
