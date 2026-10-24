import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  serializePlan,
  deserializePlan,
  type ResidentContact,
  type ResidentPlan,
  type SupportedLanguage,
} from "../plan-storage";

/**
 * Property 2: Resident plan serialization round-trips.
 *
 * For any valid `ResidentPlan`, `deserializePlan(serializePlan(plan))`
 * deep-equals the original `plan`.
 *
 * Validates: Requirements 4.3
 */
describe("Feature: app, Property 2: Resident plan serialization round-trips", () => {
  // The six languages the resident experience supports.
  const languageArb: fc.Arbitrary<SupportedLanguage> = fc.constantFrom(
    "en",
    "es",
    "pt",
    "ht",
    "zh-Hans",
    "vi",
  );

  // A ZIP is stored as a free-form string; use 5-digit strings as a
  // representative valid shape.
  const zipArb: fc.Arbitrary<string> = fc
    .integer({ min: 0, max: 99999 })
    .map((n) => String(n).padStart(5, "0"));

  const deviceTypesArb: fc.Arbitrary<string[]> = fc.array(fc.string(), {
    maxLength: 5,
  });

  // Non-negative, finite battery hours — consistent with the validator that
  // gates what is ever stored.
  const batteryHoursArb: fc.Arbitrary<number> = fc.double({
    min: 0,
    max: 1_000_000,
    noNaN: true,
    noDefaultInfinity: true,
  });

  const contactArb: fc.Arbitrary<ResidentContact> = fc.record({
    name: fc.string(),
    phone: fc.string(),
  });

  // Up to three emergency contacts (the plan cap).
  const contactsArb: fc.Arbitrary<ResidentContact[]> = fc.array(contactArb, {
    minLength: 0,
    maxLength: 3,
  });

  const planArb: fc.Arbitrary<ResidentPlan> = fc.record({
    zip: zipArb,
    deviceTypes: deviceTypesArb,
    batteryHours: batteryHoursArb,
    contacts: contactsArb,
    language: languageArb,
  });

  it("recovers the original plan after a serialize/deserialize round-trip", () => {
    fc.assert(
      fc.property(planArb, (plan) => {
        const restored = deserializePlan(serializePlan(plan));
        expect(restored).toEqual(plan);
      }),
      { numRuns: 200 },
    );
  });
});
