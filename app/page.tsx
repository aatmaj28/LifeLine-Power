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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-4 py-12">
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
          PowerPlan
        </h1>
        <p className="text-lg text-gray-900">
          Storm prep for people whose lives depend on electricity.
        </p>
      </header>

      <section aria-labelledby="who-heading" className="flex flex-col gap-4">
        <h2 id="who-heading" className="text-xl font-semibold text-gray-900">
          Who PowerPlan is for
        </h2>
        <p className="text-base leading-relaxed text-gray-900">
          Some people need power for medical equipment. That can mean an oxygen
          concentrator, home dialysis, a ventilator, or a powered wheelchair.
          When a storm knocks out power, that is more than a lost light. It can
          become an emergency.
        </p>
        <p className="text-base leading-relaxed text-gray-900">
          PowerPlan helps you get ready. If you rely on powered equipment, make
          a simple plan for your home. If you help a community get ready, see
          where to focus your outreach.
        </p>
      </section>

      <nav aria-label="Choose how to use PowerPlan" className="flex flex-col gap-4">
        <Link
          href="/plan"
          className="flex min-h-[44px] flex-col gap-1 rounded-lg bg-blue-700 px-6 py-4 text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          <span className="text-lg font-semibold">Make my storm plan</span>
          <span className="text-sm text-blue-50">
            For residents who rely on powered medical equipment.
          </span>
        </Link>

        <Link
          href="/planner"
          className="flex min-h-[44px] flex-col gap-1 rounded-lg border-2 border-blue-700 bg-white px-6 py-4 text-blue-800 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          <span className="text-lg font-semibold">Planner dashboard</span>
          <span className="text-sm text-gray-800">
            For planners doing outreach across Massachusetts.
          </span>
        </Link>
      </nav>
    </main>
  );
}
