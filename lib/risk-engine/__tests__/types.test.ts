import { describe, it, expect } from "vitest";
import { makeSmallCount } from "../types";

/**
 * Unit tests for makeSmallCount.
 *
 * emPOWER masks small cells by reporting a value of 11 to mean "11 or fewer".
 * makeSmallCount encodes that rule: 11 is masked with the "11 or fewer" label,
 * every other value is unmasked and labeled with its decimal string.
 *
 * Validates: Requirement 1.6
 */
describe("makeSmallCount", () => {
  it("masks a value of 11 with the '11 or fewer' label", () => {
    const result = makeSmallCount(11);
    expect(result).toEqual({
      value: 11,
      masked: true,
      label: "11 or fewer",
    });
  });

  it("does not mask values other than 11 and labels them with String(n)", () => {
    for (const n of [0, 1, 10, 12, 100, 11000]) {
      const result = makeSmallCount(n);
      expect(result.masked).toBe(false);
      expect(result.value).toBe(n);
      expect(result.label).toBe(String(n));
    }
  });

  it("does not mask the boundary values 10 and 12", () => {
    expect(makeSmallCount(10)).toEqual({
      value: 10,
      masked: false,
      label: "10",
    });
    expect(makeSmallCount(12)).toEqual({
      value: 12,
      masked: false,
      label: "12",
    });
  });
});
