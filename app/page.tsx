import Link from "next/link";
import {
  ArrowRight,
  BatteryCharging,
  ClipboardList,
  CloudLightning,
  LayoutDashboard,
  MapPin,
  Printer,
  type LucideIcon,
} from "lucide-react";

import { h2Classes } from "@/components/ui/SectionHeading";

/**
 * Landing page (`/`).
 *
 * A server component (no "use client") that explains who PowerPlan is for in
 * plain, calm language and offers two prominent controls: one that routes a
 * resident to the storm-plan flow (`/plan`) and one that routes a planner to
 * the outreach dashboard (`/planner`).
 *
 * Accessibility (WCAG 2.2 AA): a single `<main>` landmark with an `<h1>` and
 * `<h2>`s in order; both CTAs are Next.js `<Link>`s whose visible text is
 * their accessible name (icons and arrows are aria-hidden); each is a large
 * tap target with the global focus ring; colors meet 4.5:1 for text. The
 * illustration is decorative and hidden from assistive technology.
 *
 * Plain language: short sentences, one idea each, calm tone, no medical advice
 * and no guidance on when to leave.
 */

function CtaCard({
  href,
  icon: Icon,
  title,
  description,
  primary,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "group flex min-h-[48px] items-center gap-4 rounded-xl border-2 p-5 shadow-card transition-shadow hover:shadow-raised motion-reduce:transition-none",
        primary
          ? "border-power-edge bg-power-amber text-power-ink"
          : "border-storm-navy bg-white text-storm-navy",
      ].join(" ")}
    >
      <span
        className={[
          "inline-flex h-12 w-12 flex-none items-center justify-center rounded-lg",
          primary ? "bg-white/70" : "bg-mist",
        ].join(" ")}
      >
        <Icon aria-hidden="true" focusable="false" className="h-6 w-6" />
      </span>
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-xl font-bold">{title}</span>
        <span className="text-base leading-snug">{description}</span>
      </span>
      <ArrowRight
        aria-hidden="true"
        focusable="false"
        className="h-6 w-6 flex-none transition-transform group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
      />
    </Link>
  );
}

/** Decorative illustration: a house with a plug and a battery level. */
function HouseIllustration() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 400 320"
      className="h-auto w-full max-w-md"
    >
      {/* Ground */}
      <rect x="20" y="276" width="360" height="8" rx="4" className="fill-neutral-300" />
      {/* House body */}
      <rect x="70" y="140" width="190" height="136" rx="6" className="fill-white stroke-storm-navy" strokeWidth="6" />
      {/* Roof */}
      <path d="M52 150 L165 62 L278 150" className="fill-none stroke-storm-navy" strokeWidth="10" strokeLinejoin="round" strokeLinecap="round" />
      {/* Door */}
      <rect x="146" y="200" width="44" height="76" rx="4" className="fill-mist stroke-storm-navy" strokeWidth="5" />
      {/* Window with warm light */}
      <rect x="92" y="170" width="38" height="38" rx="4" className="fill-power-amber stroke-storm-navy" strokeWidth="5" />
      <rect x="206" y="170" width="38" height="38" rx="4" className="fill-power-tint stroke-storm-navy" strokeWidth="5" />
      {/* Cord from the house to the battery */}
      <path d="M260 236 C 290 236, 290 200, 312 200" className="fill-none stroke-storm-navy" strokeWidth="5" strokeLinecap="round" />
      {/* Plug */}
      <rect x="252" y="226" width="16" height="22" rx="3" className="fill-storm-navy" />
      {/* Battery */}
      <rect x="306" y="120" width="64" height="150" rx="10" className="fill-white stroke-storm-navy" strokeWidth="6" />
      <rect x="324" y="106" width="28" height="14" rx="3" className="fill-storm-navy" />
      {/* Battery level: three of four cells filled */}
      <rect x="316" y="224" width="44" height="34" rx="4" className="fill-power-amber" />
      <rect x="316" y="184" width="44" height="34" rx="4" className="fill-power-amber" />
      <rect x="316" y="144" width="44" height="34" rx="4" className="fill-power-amber" />
      <rect x="316" y="132" width="44" height="6" rx="3" className="fill-neutral-200" />
      {/* Storm cloud */}
      <path
        d="M96 70 a26 26 0 0 1 50 -8 a20 20 0 0 1 30 24 h-80 a18 18 0 0 1 0 -16 z"
        className="fill-neutral-200 stroke-storm-navy"
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const STEPS: ReadonlyArray<{ icon: LucideIcon; title: string; text: string }> = [
  {
    icon: MapPin,
    title: "Tell us what you use",
    text: "Enter your ZIP code, your devices, and how long your backup battery lasts.",
  },
  {
    icon: CloudLightning,
    title: "See storm alerts",
    text: "We show live alerts from the National Weather Service for your area.",
  },
  {
    icon: Printer,
    title: "Keep your plan close",
    text: "Print or share your plan. Put a copy on your fridge.",
  },
];

export default function Home() {
  return (
    <main id="main-content" className="flex flex-1 flex-col">
      {/* Hero: two columns on desktop, stacked on mobile. */}
      <section className="border-b border-neutral-200 bg-white">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:grid-cols-2 md:py-16">
          <div className="flex flex-col gap-6">
            <h1 className="text-3xl font-bold leading-tight text-storm-navy sm:text-4xl lg:text-5xl">
              PowerPlan: storm prep for people whose lives depend on electricity.
            </h1>
            <p className="text-xl leading-relaxed text-neutral-700">
              If you use an oxygen concentrator, home dialysis, a ventilator, or
              a powered wheelchair, an outage is more than lost lights. Make a
              simple plan now, so you know what to do.
            </p>

            <nav aria-label="Choose how to use PowerPlan" className="flex flex-col gap-4">
              <CtaCard
                href="/plan"
                icon={ClipboardList}
                title="Make my storm plan"
                description="For residents who rely on powered medical equipment."
                primary
              />
              <CtaCard
                href="/planner"
                icon={LayoutDashboard}
                title="Planner dashboard"
                description="For planners doing outreach across Massachusetts."
              />
            </nav>
          </div>

          <div className="flex justify-center md:justify-end">
            <HouseIllustration />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-heading" className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6">
        <h2 id="how-heading" className={h2Classes}>
          How it works
        </h2>
        <ol className="mt-6 grid gap-5 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li
              key={title}
              className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-6 shadow-card"
            >
              <span className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-storm-navy text-lg font-bold text-white">
                  {index + 1}
                </span>
                <Icon aria-hidden="true" focusable="false" className="h-6 w-6 text-storm-navy" />
              </span>
              <h3 className="text-xl font-bold text-storm-navy">{title}</h3>
              <p className="text-base leading-relaxed text-neutral-700">{text}</p>
            </li>
          ))}
        </ol>

        {/* Credibility line */}
        <p className="mt-8 flex items-start gap-3 rounded-lg bg-white p-4 text-base leading-relaxed text-neutral-700 shadow-card">
          <BatteryCharging aria-hidden="true" focusable="false" className="mt-0.5 h-6 w-6 flex-none text-storm-navy" />
          <span>
            Built on public data: HHS emPOWER (aggregated, de-identified Medicare
            data) and live National Weather Service alerts. Your plan stays in
            your browser. Only your ZIP code is sent, to look up alerts.
          </span>
        </p>
      </section>
    </main>
  );
}
