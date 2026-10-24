// components/FridgeCard.tsx
//
// A one-page print layout of the resident's plan, meant to be stuck on the
// fridge. Large text, the battery bar, devices, contacts, the two fixed safety
// lines, verified help numbers, and a QR code.
//
// The QR code is generated in the browser (qrcode npm package) by the page and
// passed in as a data URL. It encodes a /plan link with the plan in the URL
// fragment (after "#"), which browsers never send to a server. Because the code
// contains the plan, the card carries the trust note required by the spec.
//
// Honesty rules: battery timeline labeled "based on what you entered"; no
// medical advice; no evacuation timing; no shelter-power claims.

import type { Timeline } from "@/lib/risk-engine";
import type { ResolvedCopy } from "@/lib/app/copy/resolve";
import type { ResidentPlan } from "@/lib/app/plan-storage";

import { BatteryTimeline, HELP_RESOURCES } from "./OutagePlanCard";

export const QR_TRUST_NOTE =
  "This code contains your plan. Share it only with people you trust.";

export interface FridgeCardProps {
  plan: ResidentPlan;
  copy: ResolvedCopy;
  timeline: Timeline | null;
  /** The battery sentence (already labeled "based on what you entered"). */
  timelineText: string | null;
  /** QR code as an image data URL, or null while it is being made. */
  qrDataUrl: string | null;
  className?: string;
}

export function FridgeCard({
  plan,
  copy,
  timeline,
  timelineText,
  qrDataUrl,
  className,
}: FridgeCardProps) {
  const c = copy.catalog;
  return (
    <article
      aria-label="Fridge card"
      className={[
        "fridge-card flex flex-col gap-4 bg-white p-2 text-storm-navy",
        className ?? "",
      ].join(" ")}
      style={{ fontSize: "18pt", lineHeight: 1.3 }}
    >
      <header className="flex items-start justify-between gap-6 border-b-4 border-storm-navy pb-3">
        <div className="flex flex-col gap-1">
          <p className="text-[14pt] font-bold">PowerPlan</p>
          <h2 className="text-[28pt] font-bold leading-tight">{c["page.title"]}</h2>
          {plan.zip ? <p className="text-[16pt]">ZIP {plan.zip}</p> : null}
        </div>
        <div className="flex w-[2.1in] shrink-0 flex-col items-center gap-1 text-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR code that opens this plan on a phone"
              width={190}
              height={190}
              className="h-[1.9in] w-[1.9in]"
            />
          ) : (
            <p className="text-[11pt]">Making QR code…</p>
          )}
          <p className="text-[11pt] font-bold leading-snug">{QR_TRUST_NOTE}</p>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <h3 className="text-[20pt] font-bold">{c["card.batteryTimeline.heading"]}</h3>
        {timeline && timelineText ? (
          <BatteryTimeline timeline={timeline} sentence={timelineText} />
        ) : (
          <p>{c["form.batteryHours.label"]}</p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-6">
        <section className="flex flex-col gap-1">
          <h3 className="text-[20pt] font-bold">{c["card.devices.heading"]}</h3>
          {plan.deviceTypes.length > 0 ? (
            <ul className="flex flex-col">
              {plan.deviceTypes.map((d, i) => (
                <li key={`${d}-${i}`}>{d}</li>
              ))}
            </ul>
          ) : (
            <p>{c["form.deviceTypes.label"]}</p>
          )}
        </section>
        <section className="flex flex-col gap-1">
          <h3 className="text-[20pt] font-bold">{c["card.contacts.heading"]}</h3>
          {plan.contacts.length > 0 ? (
            <ul className="flex flex-col">
              {plan.contacts.map((p, i) => (
                <li key={`${p.name}-${i}`}>
                  <span className="font-bold">{p.name}</span>
                  {p.phone ? <span> {p.phone}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>{c["form.contactName.label"]}</p>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-1">
        <h3 className="text-[20pt] font-bold">{c["card.helpNumbers.heading"]}</h3>
        <ul className="flex flex-col">
          {HELP_RESOURCES.map((h) => (
            <li key={h.labelKey}>
              <span className="font-bold">{c[h.labelKey]}:</span> {h.detail}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2 border-4 border-storm-navy p-3 font-bold">
        <p>{copy.safetyLine1}</p>
        <p>{copy.safetyLine2}</p>
      </section>
    </article>
  );
}

export default FridgeCard;
