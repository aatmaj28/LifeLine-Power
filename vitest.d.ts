// Type augmentation for the custom matchers registered in vitest.setup.ts.
//
// @testing-library/jest-dom supplies DOM matchers (toBeInTheDocument, etc.) and
// vitest-axe supplies toHaveNoViolations. Under Vitest 2 the matcher types must
// augment the `vitest` module's `Assertion`/`AsymmetricMatchersContaining`
// interfaces so they are recognized regardless of the asserted value type
// (including axe's AxeResults).
import "@testing-library/jest-dom/vitest";
import type { AxeMatchers } from "vitest-axe";

declare module "vitest" {
  interface Assertion<T = any> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
