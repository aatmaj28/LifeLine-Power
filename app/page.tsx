import Link from "next/link";

/**
 * Landing page (`/`).
 *
 * A server component (no "use client") that explains who PowerPlan is for in
 * plain, calm language and offers two prominent controls: one that routes a
 * resident to the storm-plan flow (`/plan`) and one that routes a planner to
 * the outreach dashboard (`/planner`).
 *
 * Accessibility (WCAG 2.2 AA): a single `<main>` landmark with an `<h1>` in
 * logical order; both navigation controls are Next.js `<Link>`s whose visible
 * text is their accessible name; each is a large tap target (>= 44px) with a
 * visible `focus-visible` ring; colors meet the 4.5:1 text contrast target.
 *
 * Plain language: short sentences, one idea each, calm tone, no medical advice
 * and no guidance on when to leave.
 *
 * _Requirements: 3.1, 3.2, 3.3, 10.3, 10.4_
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Navy header strip carrying the product name as the page heading. */}
      <header className="bg-storm-navy">
        <div className="mx-auto w-full max-w-[680px] px-4 py-5">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            PowerPlan
          </h1>
        </div>
      </header>

      {/* Left-aligned content column. */}
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-8 px-4 py-10">
        <div className="flex flex-col gap-4">
          <p className="text-2xl font-semibold leading-snug text-storm-navy sm:text-3xl">
            Storm prep for people whose lives depend on electricity.
          </p>
          <p className="text-lg leading-relaxed text-storm-navy">
            Some people need power for medical equipment. That can mean an
            oxygen concentrator, home dialysis, a ventilator, or a powered
            wheelchair. When a storm knocks out power, that is more than a lost
            light. It can become an emergency.
          </p>
          <p className="text-lg leading-relaxed text-storm-navy">
            PowerPlan helps you get ready. If you rely on powered equipment,
            make a simple plan for your home. If you help a community get ready,
            see where to focus your outreach.
          </p>
        </div>

        <nav
          aria-label="Choose how to use PowerPlan"
          className="flex flex-col gap-4"
        >
          <Link
            href="/plan"
            className="flex min-h-[44px] flex-col gap-1 rounded-lg bg-power-amber px-6 py-4 text-power-ink transition-colors hover:brightness-95 focus-visible:outline-none motion-reduce:transition-none"
          >
            <span className="text-lg font-semibold">Make my storm plan</span>
            <span className="text-base">
              For residents who rely on powered medical equipment.
            </span>
          </Link>

          <Link
            href="/planner"
            className="flex min-h-[44px] flex-col gap-1 rounded-lg border-2 border-storm-navy bg-white px-6 py-4 text-storm-navy transition-colors hover:bg-mist focus-visible:outline-none motion-reduce:transition-none"
          >
            <span className="text-lg font-semibold">Planner dashboard</span>
            <span className="text-base">
              For planners doing outreach across Massachusetts.
            </span>
          </Link>
        </nav>
      </div>
    </main>
  );
}
