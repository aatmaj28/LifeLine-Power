// components/ui/SectionHeading.tsx
//
// The one h2 style. Optional decorative icon (always next to the text, never
// alone) and an optional short description under the heading.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export const h1Classes = "text-3xl font-bold leading-tight text-storm-navy sm:text-4xl";
export const h2Classes = "text-2xl font-bold leading-snug text-storm-navy";
export const h3Classes = "text-lg font-bold text-storm-navy";

export interface SectionHeadingProps {
  id?: string;
  icon?: LucideIcon;
  children: ReactNode;
  description?: ReactNode;
  className?: string;
}

export function SectionHeading({ id, icon: Icon, children, description, className }: SectionHeadingProps) {
  return (
    <div className={["flex flex-col gap-1", className].filter(Boolean).join(" ")}>
      <h2 id={id} className={`flex items-center gap-2 ${h2Classes}`}>
        {Icon ? <Icon aria-hidden="true" focusable="false" className="h-6 w-6 shrink-0 text-storm-navy" /> : null}
        <span>{children}</span>
      </h2>
      {description ? <p className="text-base leading-relaxed text-neutral-600">{description}</p> : null}
    </div>
  );
}

export default SectionHeading;
