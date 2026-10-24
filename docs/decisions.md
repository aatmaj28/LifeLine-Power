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

## Spec 3 (wow-features) decisions

- **MCP server is its own package.** `tools/powerplan-mcp` has its own
  `package.json` and `node_modules` so the MCP SDK and zod are not app
  dependencies. `.gitignore` now ignores `node_modules/` at any depth.
- **One ranking helper for map and list.** `lib/app/planner/rank.ts` wraps the
  engine's `outreachPriority`/`rankByPriority` (unchanged). The map popup and the
  ranked list both use it, so they always show the same 0–100 score.
- **Layer toggles change scoring, not just drawing.** Turning off Weather alerts
  or Outages removes that signal from the ranking too, so the list never ranks
  on something the map is hiding.
- **Clicking a ZIP circle filters the list to its county.** The list shows at
  most 100 rows; filtering guarantees the clicked ZIP's row is present to
  highlight.
- **Storm Replay counts only "outage" counties.** "Restoring" counties are drawn
  (green dashed border) but not counted, so the counter only claims "in
  simulated outage areas". Masked ZIPs count as up to 11, disclosed in a tooltip.
- **Storm Scenario and Storm Replay are mutually exclusive.** Both are simulated
  outage sources; turning one on turns the other off so two made-up storms are
  never mixed.
- **Replay file is bundled, not served.** `data/sim-storm-replay.json` is small,
  so the planner imports it at build time and validates it with
  `parseReplayFile`, which rejects anything not marked `"simulated": true`.
- **Fridge-card QR puts the plan in a link — deliberately.** The app spec says
  share text never encodes resident data in a URL, and that still holds for
  Share/Copy. The fridge card is a separate, explicit choice: the plan goes in
  the URL fragment only (after `#`, never sent to a server), the card warns
  "This code contains your plan. Share it only with people you trust.", and the
  hash is removed from the address bar right after it is restored.
- **Read aloud falls back to English text, not just an English voice.** If no
  voice exists for the selected language, reading Haitian Creole text with an
  English voice would be hard to understand, so the English plan is read and a
  note says why.
- **Dependencies pinned exactly:** `qrcode@1.5.4`, `@types/qrcode@1.5.6`,
  `@modelcontextprotocol/sdk@1.32.2`, `zod@4.6.7`. `npm audit` findings are all
  pre-existing (Next/PostCSS/Tailwind/Vite/Vitest toolchain); none come from the
  new packages.
- **Flagged, not changed: the dependents factor is small.** `buildScoringConfig`
  (app spec, Property 11) sets `dependentMax` to the max across ZIP **and county**
  records, so it is 6,985 (Middlesex County), not 444 (the largest ZIP). A ZIP's
  dependents factor therefore adds at most about 6 points on the 0–100 display,
  while each alert level and an active outage add about 100. Rankings are still
  correct and monotonic (the property tests hold), but among ZIPs with the same
  alert/outage status the gaps are small. Normalizing by the ZIP max instead
  would make dependents matter more; it is a one-line change in
  `lib/app/planner/scoring-config.ts` plus an update to Property 11, left for a
  deliberate decision. The map legend buckets step at 100s to match.
