"use client";

// components/SiteHeader.tsx
//
// The app-wide header (banner landmark): PowerPlan wordmark linking home and
// the two primary nav links. The current page is marked aria-current="page"
// and shown with an underline, not color alone. Hidden when printing.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutDashboard, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const NAV: ReadonlyArray<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/plan", label: "Make a plan", icon: ClipboardList },
  { href: "/planner", label: "Planner", icon: LayoutDashboard },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="print-hide border-b-4 border-power-amber bg-storm-navy text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center gap-2 rounded-md pr-2 text-2xl font-bold text-white"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-power-amber text-power-ink">
            <Zap aria-hidden="true" focusable="false" className="h-5 w-5" />
          </span>
          PowerPlan
        </Link>
        <nav aria-label="Main">
          <ul className="flex flex-wrap items-center gap-1 sm:gap-2">
            {NAV.map(({ href, label, icon: Icon }) => {
              const current = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={current ? "page" : undefined}
                    className={[
                      "inline-flex min-h-[48px] items-center gap-2 rounded-md px-3 text-lg font-semibold text-white",
                      "underline-offset-[6px] hover:bg-white/10",
                      current ? "underline decoration-power-amber decoration-[3px]" : "",
                    ].join(" ")}
                  >
                    <Icon aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export default SiteHeader;
