"use client";

// Resident plan storage for the PowerPlan app.
//
// A resident's plan (ZIP, device types, backup battery hours, up to three
// emergency contacts, and language) lives ONLY in the browser's localStorage.
// Nothing here ever leaves the browser. This module provides:
//
//   * pure, React-free helpers — `serializePlan`, `deserializePlan`, and the
//     battery-hours validator — safe to import from server code or tests; and
//   * a `usePlanStorage` React hook that reads the plan on mount, writes it on
//     change, and guards against server-side rendering (no `window`).
//
// The pure functions do not reference React, so importing them never pulls in
// the hook machinery. The `"use client"` directive marks the module for the
// Next.js client boundary where the hook is used.

import { useCallback, useEffect, useState } from "react";

/**
 * The six languages the resident experience supports.
 *
 * Defined locally here to avoid a cross-file dependency cycle in this wave; the
 * translation providers module declares an identical union. Keep the two in
 * sync: `"en" | "es" | "pt" | "ht" | "zh-Hans" | "vi"`.
 */
export type SupportedLanguage = "en" | "es" | "pt" | "ht" | "zh-Hans" | "vi";

/** An emergency contact the resident can be reached through. */
export interface ResidentContact {
  name: string;
  phone: string;
}

/**
 * A resident's full outage plan. Persisted to localStorage only; `batteryHours`
 * is validated non-negative before it is stored, and `contacts` is capped at 3.
 */
export interface ResidentPlan {
  zip: string;
  deviceTypes: string[];
  batteryHours: number;
  contacts: ResidentContact[];
  language: SupportedLanguage;
}

/** localStorage key under which the resident plan is persisted. */
export const PLAN_STORAGE_KEY = "powerplan.residentPlan";

/** The maximum number of emergency contacts a plan may hold. */
export const MAX_CONTACTS = 3;

const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  "en",
  "es",
  "pt",
  "ht",
  "zh-Hans",
  "vi",
];

/**
 * Battery-hours validator. Accepts exactly the non-negative, finite numbers and
 * rejects everything below zero — consistent with the engine's
 * `NEGATIVE_DURATION` semantics, where `batteryTimeline(h, start)` errors iff
 * `h < 0`. `NaN` and non-finite values are rejected.
 */
export function isValidBatteryHours(h: number): boolean {
  return Number.isFinite(h) && h >= 0;
}

/** Serialize a resident plan to a JSON string for localStorage. */
export function serializePlan(plan: ResidentPlan): string {
  return JSON.stringify(plan);
}

function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return (
    typeof value === "string" &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  );
}

function isResidentContact(value: unknown): value is ResidentContact {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" && typeof candidate.phone === "string"
  );
}

/**
 * Parse a JSON string back into a {@link ResidentPlan}. Tolerant of bad input:
 * returns `null` on a JSON parse error or any shape mismatch rather than
 * throwing, so a corrupted localStorage value can never break a page.
 */
export function deserializePlan(text: string): ResidentPlan | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const candidate = parsed as Record<string, unknown>;

  if (typeof candidate.zip !== "string") {
    return null;
  }

  if (
    !Array.isArray(candidate.deviceTypes) ||
    !candidate.deviceTypes.every((d): d is string => typeof d === "string")
  ) {
    return null;
  }

  if (typeof candidate.batteryHours !== "number") {
    return null;
  }

  if (
    !Array.isArray(candidate.contacts) ||
    !candidate.contacts.every(isResidentContact)
  ) {
    return null;
  }

  if (!isSupportedLanguage(candidate.language)) {
    return null;
  }

  return {
    zip: candidate.zip,
    deviceTypes: [...candidate.deviceTypes],
    batteryHours: candidate.batteryHours,
    contacts: candidate.contacts.map((c) => ({
      name: c.name,
      phone: c.phone,
    })),
    language: candidate.language,
  };
}

/**
 * React hook that persists a {@link ResidentPlan} to localStorage only. Reads
 * the stored plan on mount, writes it whenever the plan changes, and guards
 * against SSR (`typeof window === "undefined"`) so it is safe inside a client
 * component rendered on the server.
 *
 * @param initialPlan the plan to use when nothing is stored yet.
 * @returns a `[plan, setPlan]` tuple; `setPlan` accepts a value or updater.
 */
export function usePlanStorage(
  initialPlan: ResidentPlan,
): [ResidentPlan, (next: ResidentPlan | ((prev: ResidentPlan) => ResidentPlan)) => void] {
  const [plan, setPlanState] = useState<ResidentPlan>(initialPlan);

  // Read any persisted plan once on mount (client only).
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(PLAN_STORAGE_KEY);
    if (stored === null) {
      return;
    }
    const restored = deserializePlan(stored);
    if (restored !== null) {
      setPlanState(restored);
    }
  }, []);

  // Write the plan to localStorage whenever it changes (client only).
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(PLAN_STORAGE_KEY, serializePlan(plan));
  }, [plan]);

  const setPlan = useCallback(
    (next: ResidentPlan | ((prev: ResidentPlan) => ResidentPlan)) => {
      setPlanState((prev) =>
        typeof next === "function"
          ? (next as (prev: ResidentPlan) => ResidentPlan)(prev)
          : next,
      );
    },
    [],
  );

  return [plan, setPlan];
}
