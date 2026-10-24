/**
 * OutagePlanCard renders a resident's personal storm power plan as one
 * print-friendly, shareable card.
 *
 * It is purely presentational: it renders from an already-resolved
 * {@link ResidentPlan}, the resolved per-language {@link ResolvedCopy}, and an
 * optional pre-computed {@link Timeline}. All headings and labels come from
 * `copy.catalog` so the card is localized, and the two fixed safety lines are
 * rendered through {@link SafetyLines}.
 *
 * Honesty and safety rules (non-negotiable):
 *   - The battery timeline is always labeled "based on what you entered"; the
 *     label is appended by `formatBatteryTimeline`.
 *   - Any masked emPOWER count is shown via `SmallCount.label` (e.g.
 *     "11 or fewer"), never a raw number. The resident card does not normally
 *     carry a count, but when one is passed it is rendered through its label.
 *   - No medical advice and no evacuation-timing content. The only guidance is
 *     the plain-language steps-before-storm, verified help numbers, and the two
 *     fixed safety lines.
 *   - Help numbers are limited to verified resources cited in
 *     `docs/data-notes.md`. We never claim a shelter has power, charging, or
 *     space; Mass 211 is linked for current shelter info.
 */

import type { SmallCount, Timeline } from "@/lib/risk-engine";
import type { ResidentPlan } from "@/lib/app/plan-storage";
import type { ResolvedCopy } from "@/lib/app/copy/resolve";
import { formatBatteryTimeline } from "@/lib/app/battery-format";
import { SafetyLines } from "./SafetyLines";

/** Props for {@link OutagePlanCard}. */
export interface OutagePlanCardProps {
  /** The resident's plan: ZIP, devices, battery hours, contacts, language. */
  plan: ResidentPlan;
  /** Fully resolved per-language copy (catalog + fixed safety lines + label). */
  copy: ResolvedCopy;
  /**
   * The battery-depletion timeline, computed by the page via
   * `batteryTimeline(plan.batteryHours, chosenStart)`. When absent, the card
   * prompts the resident to enter battery hours and a start time instead of
   * inventing a timeline.
   */
  timeline?: Timeline | null;
  /**
   * An optional masked/aggregated count to display via its honest label. The
   * resident card does not normally carry one; when provided it is rendered as
   * `count.label` (e.g. "11 or fewer") so a masked value is never shown raw.
   */
  smallCount?: SmallCount | null;
  /** Optional extra classes for the card container. */
  className?: string;
}

/** Each verified help resource: a catalog label key plus its verified detail. */
interface HelpResource {
  labelKey: keyof ResolvedCopy["catalog"];
  /** Verified, human-readable contact detail (see docs/data-notes.md). */
  detail: string;
  /** Optional official link; only verified official pages. */
  href?: string;
}

/**
 * Verified help resources. Wording is limited to what the official pages in
 * `docs/data-notes.md` support. We never assert a shelter has power, charging,
 * or space — Mass 211 is linked for current shelter info.
 */
const HELP_RESOURCES: readonly HelpResource[] = [
  {
    labelKey: "help.mass211.label",
    detail: "Dial 211 or visit mass211.org",
    href: "https://mass211.org",
  },
  {
    labelKey: "help.call911.label",
    detail: "Call 911 in an emergency",
  },
  {
    labelKey: "help.utilityRegistration.label",
    detail:
      "Ask your utility (such as Eversource or National Grid) about their medical or life-support program",
  },
];

/** The four plain-language steps to take before the storm, in order. */
const STEP_KEYS: readonly (keyof ResolvedCopy["catalog"])[] = [
  "steps.charge",
  "steps.callContacts",
  "steps.prepareSupplies",
  "steps.keepDevicesClose",
];

/**
 * Renders the resident Outage Plan card.
 *
 * Structure uses clean semantic headings (`h2` for the card title, `h3` per
 * section) and lists so it reads well with a screen reader and prints cleanly.
 */
export function OutagePlanCard({
  plan,
  copy,
  timeline,
  smallCount,
  className,
}: OutagePlanCardProps) {
  const containerClasses = [
    "flex flex-col gap-6 rounded-lg border border-gray-300 bg-white p-6 text-gray-900",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const timelineText = timeline
    ? formatBatteryTimeline(timeline, {
        basedOnInputLabel: copy.basedOnInputLabel,
      })
    : null;

  return (
    <article className={containerClasses} aria-label={copy.catalog["page.title"]}>
      <h2 className="text-2xl font-bold">{copy.catalog["page.title"]}</h2>

      {/* Your devices */}
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">
          {copy.catalog["card.devices.heading"]}
        </h3>
        {plan.deviceTypes.length > 0 ? (
          <ul className="list-disc pl-6">
            {plan.deviceTypes.map((device, index) => (
              <li key={`${device}-${index}`}>{device}</li>
            ))}
          </ul>
        ) : (
          <p>{copy.catalog["form.deviceTypes.label"]}</p>
        )}
      </section>

      {/* Your battery timeline */}
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">
          {copy.catalog["card.batteryTimeline.heading"]}
        </h3>
        <p>
          <span className="font-medium">
            {copy.catalog["form.batteryHours.label"]}:
          </span>{" "}
          {plan.batteryHours}
        </p>
        {timelineText ? (
          <p>{timelineText}</p>
        ) : (
          <p className="text-gray-700">
            {copy.catalog["form.batteryHours.label"]}
          </p>
        )}
      </section>

      {/* Your contacts */}
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">
          {copy.catalog["card.contacts.heading"]}
        </h3>
        {plan.contacts.length > 0 ? (
          <ul className="list-none pl-0">
            {plan.contacts.map((contact, index) => (
              <li key={`${contact.name}-${index}`}>
                <span className="font-medium">{contact.name}</span>
                {contact.phone ? <span> — {contact.phone}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>{copy.catalog["form.contactName.label"]}</p>
        )}
      </section>

      {/* Steps to take before the storm */}
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">
          {copy.catalog["card.stepsBeforeStorm.heading"]}
        </h3>
        <ol className="list-decimal pl-6">
          {STEP_KEYS.map((key) => (
            <li key={key}>{copy.catalog[key]}</li>
          ))}
        </ol>
      </section>

      {/* Official help numbers */}
      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">
          {copy.catalog["card.helpNumbers.heading"]}
        </h3>
        <ul className="list-none pl-0">
          {HELP_RESOURCES.map((resource) => (
            <li key={resource.labelKey} className="flex flex-col">
              <span className="font-medium">
                {copy.catalog[resource.labelKey]}
              </span>
              <span>
                {resource.href ? (
                  <a
                    href={resource.href}
                    className="underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {resource.detail}
                  </a>
                ) : (
                  resource.detail
                )}
              </span>
            </li>
          ))}
        </ul>
        {smallCount ? (
          <p className="text-sm text-gray-700">{smallCount.label}</p>
        ) : null}
        <p className="text-sm text-gray-600">
          Help resource details are verified and cited in docs/data-notes.md.
        </p>
      </section>

      {/* Safety lines (fixed, per-language) */}
      <SafetyLines
        safetyLine1={copy.safetyLine1}
        safetyLine2={copy.safetyLine2}
      />
    </article>
  );
}

export default OutagePlanCard;
