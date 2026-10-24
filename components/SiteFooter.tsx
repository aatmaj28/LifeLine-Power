// components/SiteFooter.tsx
//
// The app-wide footer (contentinfo landmark): the two fixed safety lines,
// where to find current shelter info, and the data sources. Hidden when
// printing. English site chrome; the plan card carries the translated lines.

import { FIXED_STRINGS } from "@/lib/app/copy/fixed-strings";
import { Phone, Stethoscope } from "lucide-react";

const SOURCES: ReadonlyArray<{ name: string; detail: string; href: string }> = [
  {
    name: "HHS emPOWER",
    detail: "aggregated, de-identified Medicare data",
    href: "https://empowerprogram.hhs.gov",
  },
  {
    name: "National Weather Service",
    detail: "live alerts",
    href: "https://www.weather.gov",
  },
  {
    name: "OpenStreetMap",
    detail: "map tiles",
    href: "https://www.openstreetmap.org/copyright",
  },
];

const linkClasses =
  "inline-flex min-h-[44px] items-center rounded-sm font-semibold text-white underline underline-offset-4 hover:decoration-power-amber";

export function SiteFooter() {
  const { safetyLine1, safetyLine2 } = FIXED_STRINGS.en;

  return (
    <footer className="print-hide mt-auto bg-storm-navy text-white">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="text-lg font-bold">Stay safe</p>
          <ul className="flex flex-col gap-2 text-base leading-relaxed">
            <li className="flex items-start gap-3">
              <Phone aria-hidden="true" focusable="false" className="mt-1 h-5 w-5 shrink-0 text-power-amber" />
              <span>{safetyLine1}</span>
            </li>
            <li className="flex items-start gap-3">
              <Stethoscope aria-hidden="true" focusable="false" className="mt-1 h-5 w-5 shrink-0 text-power-amber" />
              <span>{safetyLine2}</span>
            </li>
          </ul>
          <p className="text-base leading-relaxed">
            For current shelter information, dial 211 or visit{" "}
            <a href="https://mass211.org" className={linkClasses} target="_blank" rel="noopener noreferrer">
              mass211.org
            </a>
            .
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-lg font-bold">Data sources</p>
          <ul className="flex flex-col gap-1 text-base">
            {SOURCES.map((s) => (
              <li key={s.name}>
                <a href={s.href} className={linkClasses} target="_blank" rel="noopener noreferrer">
                  {s.name}
                </a>{" "}
                <span className="text-white/85">({s.detail})</span>
              </li>
            ))}
          </ul>
          <p className="text-sm leading-relaxed text-white/85">
            Each page shows its data source and when it was last updated.
            Anything simulated is labeled as simulated.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
