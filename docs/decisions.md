# Decisions

## emPOWER loader: empty `pct_power_dependent` treated as 0

emPOWER ZIP 02542 (Barnstable) has 0 Medicare beneficiaries and a blank computed
`pct_power_dependent`; loader treats an empty `pct_power_dependent` as 0 so the
full dataset loads. Only this derived column is lenient; all other numeric
fields still reject empty/invalid values.

## Map and test deps: react-leaflet v5, vitest-axe, per-glob jsdom

react-leaflet v5 (with leaflet 1.9, @types/leaflet 1.9) installs cleanly against
React 19 — no ERESOLVE, so no version forcing needed. For accessibility tests we
use vitest-axe (0.1) since the project is on Vitest 2, plus jsdom,
@testing-library/react, and @testing-library/jest-dom.

Vitest keeps `environment: "node"` as the default so the risk-engine suite is
unchanged, and uses `environmentMatchGlobs` to run `.tsx` and component/page/
lib/app tests under jsdom. A shared `vitest.setup.ts` registers jest-dom and
vitest-axe matchers (safe to load under node). esbuild JSX is set to the React
19 automatic runtime so component tests need no `import React`.

## Test matcher types: vitest.d.ts augments the vitest module

`@testing-library/jest-dom` and `vitest-axe` register runtime matchers
(`toBeInTheDocument`, `toHaveNoViolations`) in `vitest.setup.ts`, but under
Vitest 2 those matchers were not recognized by TypeScript on the newer
`Assertion` type (axe asserts on `AxeResults`). A `vitest.d.ts` at the repo root
augments the `vitest` module's `Assertion`/`AsymmetricMatchersContaining`
interfaces (jest-dom via `@testing-library/jest-dom/vitest`, axe via
`AxeMatchers`) so `npm run typecheck` passes.

## Accessibility hook disabled to avoid a save loop

The `axe-accessibility` hook fires on saving `app/**/*.tsx` or
`components/**/*.tsx`. Its agent action can edit `.tsx` files, which re-fires the
hook (save → check → edit → save). The hook is disabled; accessibility is
verified by the axe tests in `npm test` and at checkpoints instead.
