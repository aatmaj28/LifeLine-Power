// components/ui/Badge.tsx
//
// Small status pill. Meaning is always carried by the visible text; the tone
// color and optional icon only reinforce it.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type BadgeTone = "neutral" | "navy" | "amber" | "red" | "green";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-neutral-300 bg-neutral-50 text-neutral-700",
  navy: "border-storm-navy bg-storm-navy text-white",
  amber: "border-power-edge bg-power-tint text-power-ink",
  red: "border-alert-red bg-alert-tint text-alert-red",
  green: "border-calm-green bg-calm-tint text-calm-green",
};

export function badgeClasses(tone: BadgeTone = "neutral", className?: string): string {
  return [
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold leading-tight",
    TONES[tone],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", icon: Icon, children, className }: BadgeProps) {
  return (
    <span className={badgeClasses(tone, className)}>
      {Icon ? <Icon aria-hidden="true" focusable="false" className="h-4 w-4 shrink-0" /> : null}
      <span>{children}</span>
    </span>
  );
}

export default Badge;
