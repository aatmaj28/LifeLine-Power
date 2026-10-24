/**
 * SimulatedBadge
 *
 * Marks a data layer or view as simulated. Meaning is conveyed by visible
 * text ("Simulated") plus an icon, never by color alone (accessibility rule).
 * Use this badge only on content that is actually simulated.
 */

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
        "inline-flex items-center gap-1 rounded border border-amber-700",
        "bg-amber-100 px-2 py-1 text-sm font-semibold leading-none text-amber-900",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Icon is decorative: the visible text carries the meaning. */}
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        className="shrink-0"
        fill="currentColor"
      >
        <path d="M12 2 1 21h22L12 2zm0 5 7.53 13H4.47L12 7zm-1 4v4h2v-4h-2zm0 5v2h2v-2h-2z" />
      </svg>
      <span>{label}</span>
    </span>
  );
}
