/**
 * SafetyLines renders the two fixed per-language safety lines that must always
 * appear on the resident page.
 *
 * The strings come from resolved copy (`ResolvedCopy.safetyLine1` and
 * `ResolvedCopy.safetyLine2`, produced by `resolveCopy`). This component is
 * purely presentational: it renders whatever strings it is given so the copy
 * stays language-correct. It never hardcodes English text, and it must not
 * contain any medical advice or evacuation-timing content — the only guidance
 * shown is the two provided safety lines.
 */

import { Phone, Stethoscope } from "lucide-react";

export interface SafetyLinesProps {
  /** Fixed safety line 1, verbatim from the per-language table (e.g. "...call 911."). */
  safetyLine1: string;
  /** Fixed safety line 2, verbatim from the per-language table (e.g. "Talk to your doctor..."). */
  safetyLine2: string;
  /** Optional extra classes for the container. */
  className?: string;
}

/**
 * Renders both fixed safety lines in a visually prominent, accessible callout.
 *
 * Importance is conveyed with a warning icon and emphasized text in addition
 * to color, so meaning never depends on color alone. Semantic markup (a note
 * landmark and a list) keeps it screen-reader friendly. No visible label is
 * hardcoded in English, so the callout stays correct in every language.
 */
export function SafetyLines({
  safetyLine1,
  safetyLine2,
  className,
}: SafetyLinesProps) {
  const containerClasses = [
    "rounded-lg border-2 border-power-edge bg-power-tint p-4 text-power-ink",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section role="note" className={containerClasses}>
      <ul className="flex list-none flex-col gap-3 text-base font-semibold leading-relaxed">
        <li className="flex items-start gap-3">
          <Phone aria-hidden="true" focusable="false" className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{safetyLine1}</span>
        </li>
        <li className="flex items-start gap-3">
          <Stethoscope aria-hidden="true" focusable="false" className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{safetyLine2}</span>
        </li>
      </ul>
    </section>
  );
}

export default SafetyLines;
