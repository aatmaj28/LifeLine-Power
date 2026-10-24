/**
 * SimulatedBadge
 *
 * Marks a data layer or view as simulated. Meaning is conveyed by visible
 * text ("Simulated") plus an icon, never by color alone (accessibility rule).
 * Use this badge only on content that is actually simulated.
 */

import { FlaskConical } from "lucide-react";

export interface SimulatedBadgeProps {
  /** Extra classes to position/space the badge in its container. */
  className?: string;
  /** Visible label. Defaults to "Simulated". */
  label?: string;
}

export default function SimulatedBadge({
  className = "",
  label = "Simulated",
}: SimulatedBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border border-power-edge",
        "bg-power-tint px-3 py-1 text-sm font-semibold leading-none text-power-ink",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Icon is decorative: the visible text carries the meaning. */}
      <FlaskConical aria-hidden="true" focusable="false" className="h-4 w-4 flex-none" />
      <span>{label}</span>
    </span>
  );
}
