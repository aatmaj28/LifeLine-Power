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
- **Dependents factor was too small (flagged in spec 3, fixed afterwards — see
  next entry).** `buildScoringConfig` set `dependentMax` to the max across ZIP
  **and county** records, so it was 6,985 (Middlesex County), not 444 (the
  largest ZIP). A ZIP's dependents factor added at most about 6 points on the
  0–100 display, while each alert level and an active outage added about 100.

## Scoring normalization: divide by the largest ZIP, not the largest county

- **Change:** `buildScoringConfig` (`lib/app/planner/scoring-config.ts`) now takes
  `dependentMax` from ZIP records only. On the real data it is **444** (ZIP
  02360), not 6,985 (Middlesex County). `lib/risk-engine` is unchanged; this is
  only the config the app passes to `outreachPriority`.
- **Why:** scores are per ZIP, so the denominator should be on the same per-ZIP
  scale as the numerator. Dividing by a county total made the number of people
  nearly irrelevant (at most about 6 of 100 points). Now the largest ZIP earns
  100 points from residents alone, on the same scale as one alert level (100)
  and an active outage (100), so people carry real weight alongside alerts and
  outages.
- **Effect on the real data, no alerts:** top ZIPs are 02360 = 100, 02780 = 94,
  01040 = 87. Score bands: 410 ZIPs score 0–29, 99 score 30–99, 1 scores 100.
- **Tests:** Property 11 asserted the old rule (max over ZIP and county
  records), so it had to change: it now asserts the max over ZIP records and
  that county totals no longer affect it. All other property tests (monotonicity,
  zero-dependent bound, outage bonus, stable ranking) passed unchanged, as
  expected for any fixed positive max. Display tests already used datasets
  without county records, so they did not change.
- **Map legend buckets** now match the new range: Lower 0–29, Medium 30–99,
  Higher 100–199, Highest 200+.
- The app spec's Property 11 text in `.kiro/specs/app/design.md` was updated to
  match.

## Outreach comparison (Storm Replay, simulated)

- **What it measures:** for the current simulated hour, the share of
  power-dependent residents in simulated outage areas who live in the first N
  ZIPs called (N = 10, 20, 50), in PowerPlan order, random order, and
  alphabetical order. Pure module: `lib/app/replay/outreach.ts`.
- **PowerPlan order is the ranked list's order**, including live weather alerts
  and the layer toggles, so the panel never measures an order the planner is
  not looking at.
- **Random baseline** averages 500 seeded shuffles (mulberry32, fixed seed). Each
  shuffle has its own seeded generator, so the first N picks are the same for
  every N; that keeps the baseline monotone in N and reproducible.
- **The sentence is computed from the numbers.** It says "vs Y% in random order"
  only when PowerPlan's rounded percentage is higher; otherwise it says "about
  the same" or "less than". A property test enforces this.
- **The claim "PowerPlan order reaches at least as many as random" is not true in
  general.** It is proven for any data with no weather alerts, and checked on the
  real replay frames. With alerts in the score, a counterexample exists
  (alerted ZIPs outside the outage area outrank affected ZIPs). Scoring was not
  changed to hide this; see the Kiro journal.

## Hosting on Netlify

- **Deployed to Netlify** (`powerplan-ma.netlify.app`) with the Netlify CLI,
  not Vercel as first planned in the tech steering.
- **`included_files = ["data/**"]`** in `netlify.toml`, because the loaders
  read `data/` via `process.cwd()` at runtime, which file tracing cannot see.
- **Visitor access:** Netlify team login applies to non-production deploys only.
  Production is public; previews stay team-only.

## UI redesign

- **One focus style.** 3px amber outline plus a 2px navy inner ring
  (`globals.css`). Components must not add `outline-none` or ring utilities.
- **Tokens in `components/ui/tokens.ts`** are the single source for colors,
  radius and shadows. Tailwind, `globals.css` (via `theme()`), and the map
  legend all read from it. `CountyChoropleth` still has its own border-color
  literals (same values). It was left untouched, as asked.
- **lucide-react pinned at 1.61.0** for icons. Icons are always `aria-hidden`
  and next to visible text.
- **Planner stat cards** show live facts. "Counties in outage" reads "Not
  tracked" in live mode, because there is no live outage feed. In practice modes
  it says "storm scenario" or "storm replay" rather than "Simulated", which
  keeps that badge text unique on the page; the simulated banner and badges
  stay next to it.
- **Ranked table** scrolls inside a focusable, labeled region so its header can
  stay pinned.
