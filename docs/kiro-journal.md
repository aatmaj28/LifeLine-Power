# Kiro journal

How PowerPlan was built with Kiro: which tools were used, how the specs were
structured, what the hooks and steering did, and the real issues we hit and
fixed along the way.

## Kiro tools used

- **Kiro IDE (agentic spec workflow)** — the primary tool. The whole app was
  built through two specs driven to completion task by task, with the agent
  reading files, writing code, running `typecheck`/`test`/`build`, and fixing
  what broke.
- **Steering** — four always-on steering docs shaped every response (see below).
- **Hooks** — three agent hooks under `.kiro/hooks/` (see below).
- **Spec task execution** — tasks were dispatched in dependency "waves" so
  independent files could be built in parallel, with checkpoints between groups
  to keep the suite green.

CLI, Web, and Crew variants were not used for this build; the work stayed in the
IDE spec workflow.

## How the specs were structured, and how that compared to vibe coding

We started with **two specs**, matching the plan, and later added a third
(`wow-features`, described in its own section below):

1. **`risk-engine`** — the data + logic layer: loaders for emPOWER CSVs, NWS
   alerts, and simulated outages; an explainable `outreachPriority` scorer;
   `rankByPriority`; and a pure `batteryTimeline`. Requirements → design →
   tasks, with a Correctness Properties section mapping seven invariants to the
   functions under test.
2. **`app`** — the Next.js UI on top of the engine: API routes, the resident
   flow, the planner dashboard, the translation layer, and the components. Its
   design added twelve correctness properties for the new pure helpers only
   (the engine's own logic was already property-tested and was not re-tested).

What the spec approach bought us over vibe coding:

- **The design caught boundaries before code existed.** Deciding in the design
  that `loadEmpowerDataset` reads the filesystem (so it must live in server API
  routes, never client components) is what kept the UI honest later. A vibe pass
  would likely have imported it into a client component and discovered the
  problem only at build time.
- **Explicit requirements made honesty testable.** "Value 11 means 11 or fewer",
  "simulated data is always labeled", and "never fabricate data on error" became
  acceptance criteria and then tests, instead of good intentions.
- **The task graph enabled safe parallelism.** Tasks were grouped into waves;
  same-file writes were split across waves so parallel sub-agents never
  collided. Checkpoints after each group ran the full suite so regressions
  surfaced immediately.

The trade-off: the spec phase is more up-front work than vibe coding. It paid
off here because the product has hard correctness and honesty rules, and because
the two layers had a real contract between them.

## Hooks and what they automated

Three hooks live in `.kiro/hooks/`:

1. **`risk-engine-tests`** (on save of `lib/risk-engine/**/*.ts`) — runs the
   engine's unit and property tests so a change to a loader or the scorer is
   verified immediately.
2. **`journal-on-task-complete`** (on spec task completion) — appends a short
   note to this journal describing what finished and which Kiro feature helped.
3. **`axe-accessibility`** (on save of `app/**/*.tsx` or `components/**/*.tsx`) —
   runs the axe accessibility tests. It was disabled after it looped (see
   "Accessibility hook loop" below) and **re-enabled in spec 3** with a
   report-only prompt that forbids editing files, so it can no longer
   re-trigger itself.

## How steering changed responses

Four always-included steering docs (`.kiro/steering/`) shaped the whole build:

- **`product.md`** kept the honesty and safety rules present in every decision:
  no shelter-power claims, no medical advice, the two fixed safety lines, the
  "based on what you entered" label, and "simulated is always labeled".
- **`tech.md`** pinned the stack and the key rule that the UI must import the
  engine's public API and never re-implement loaders or scoring. It also set the
  "works with no AI key" requirement for translation.
- **`accessibility.md`** (WCAG 2.2 AA) drove concrete choices: text labels (not
  color) on badges, 44px tap targets, visible focus, the ranked list as a
  non-map alternative to the choropleth, and `prefers-reduced-motion`.
- **`plain-language.md`** governed all resident copy (short, calm, 6th-grade,
  always say what to do next) and required the safety lines to survive
  translation.

Concretely, steering is why the components convey meaning with text + icon
rather than color, why the Outage Plan card never contains medical or
evacuation-timing advice, and why the translation layer treats the safety lines
as fixed strings that are never sent to an AI provider.

## MCP servers used

Specs 1 and 2 used none. Spec 3 built one: the **PowerPlan data MCP server**
(`tools/powerplan-mcp`), a small stdio server over our own emPOWER CSVs with
three read-only tools: `county_summary`, `top_zips`, and `zip_detail`. It was
built first in spec 3 so it could be used while building the rest. Why: picking
demo ZIPs and checking counter totals by grepping CSVs is slow and error prone;
asking a typed tool "top 3 ZIPs in Barnstable" or "Plymouth's ZIP total" is fast
and returns honest labels ("11 or fewer") every time. Every use is listed in the
"MCP usage log" at the end of this journal.

## Kiro powers used

None.

## What property-based tests caught / verified

The property tests encode the invariants that make the scoring trustworthy, and
they ran on every engine save via the `risk-engine-tests` hook:

- **Monotonicity** — `outreachPriority` never decreases when the dependent count
  rises, and never decreases when alert severity rises (all else equal). This
  pinned down a subtle design point: normalization must divide by a **fixed
  dataset-wide maximum**, not a per-call maximum. A per-call max would let one
  ZIP's score change when a different ZIP's count changed, breaking
  monotonicity. The property made that requirement explicit before it could
  become a bug.
- **Zero-dependent bound** — a ZIP with zero dependents never outranks an
  otherwise-identical ZIP with more.
- **Outage bonus** — adding an active outage never lowers a score, and every
  reason contribution is non-negative.
- **Stable ranking** — `rankByPriority` produces the same order for any
  permutation of the same set (deterministic tiebreak by ZIP).
- **Battery timeline** — depletion is never before the outage start and grows
  with battery hours; negative hours are rejected, never silently scored.
- **Honest rejection** — unknown ZIPs and negative durations return typed errors
  rather than a fabricated result.

On the app side, property tests verified the pure helpers: the API envelope
never attaches a value to an error, plan serialization round-trips, county
aggregation equals the sum of its ZIPs, the translation provider chain resolves
deterministically and never throws, and the fixed safety strings are never
included in a provider request.

## Real issues we hit and fixed

These are the concrete problems that came up during the build and how they were
resolved.

### 1. emPOWER ZIP 02542 blank value

Loading the real emPOWER ZIP CSV failed because ZIP 02542 (Barnstable) has 0
Medicare beneficiaries and therefore a **blank** `pct_power_dependent` (the
column is a computed ratio, undefined when the denominator is 0). The loader
correctly rejects empty numeric fields — but that strictness blocked the whole
dataset from loading, which violated the "emPOWER loads from the CSVs"
requirement.

Fix: treat an empty value **only in the derived `pct_power_dependent` column** as
0; every other numeric field stays strict and still rejects empty/invalid
values. Logged in `docs/decisions.md`. A targeted parser test and a real-data
integration test now cover it, and all 510 ZIP rows load.

### 2. Client/server import boundary

The client pages (`/plan`, `/planner`) initially imported engine runtime values
from the `lib/risk-engine` barrel. That barrel re-exports the filesystem loaders
(`loadEmpowerDataset`, `loadSimulatedOutages`), which use `node:fs`. Pulling the
barrel into a client bundle broke `next build`.

Fix: client components import **only the pure modules** they need
(`lib/risk-engine/battery`, `lib/risk-engine/scoring`,
`lib/risk-engine/alert-loader`) for runtime values, and import everything else
as types (which are erased at build). The filesystem loaders stay on the server,
reached only through the API routes. This is exactly the server/client split the
design called out — the build is what enforced it.

### 3. Leaflet under jsdom

The planner accessibility (axe) test rendered the real `CountyChoropleth`, and
under jsdom Leaflet tried to parse GeoJSON and threw "Invalid GeoJSON object".
All tests still passed, but Vitest flagged an unhandled error that could cause
false positives.

Fix: mock `@/components/CountyChoropleth` in the axe and planner-page tests so
Leaflet never executes under jsdom. The ranked list — the accessible, non-map
path those tests actually assert against — is unaffected. The unhandled error is
gone; the suite reports zero errors.

### 4. Invalid hook trigger type

The `journal-on-task-complete` hook was first written with
`when.type: "specTaskCompleted"`, which is not a valid trigger. It was corrected
to **`postTaskExecution`**, and the file-pattern `matcher`/`patterns` (which
don't apply to task-event triggers) were removed. The other two hooks already
used the valid `fileEdited` type.

### 5. Accessibility hook loop

The `axe-accessibility` hook triggers on saving any `app/**/*.tsx` or
`components/**/*.tsx` file. Because the agent it invokes can itself edit `.tsx`
files while fixing a violation, each fix save re-fired the hook — a
save → check → edit → save loop. The hook is now **disabled**
(`"enabled": false`) to break the cycle; accessibility is instead verified by
the axe tests that run as part of `npm test` and at the checkpoints. The lesson:
a `PostFileSave`/`fileEdited` hook whose action can modify files matching its own
pattern needs a guard or should be run on demand rather than on every save.

## Spec 3: `wow-features`

A third Quick Spec (`.kiro/specs/wow-features/`) added demo features in a fixed
priority order, finishing each fully before starting the next:

1. **PowerPlan data MCP server** — built first so it could be used for the rest
   of the spec (see "MCP usage log").
2. **Map as the hero of /planner** — ZIP circles from Census 2020 ZCTA centroids,
   popups, map ↔ list selection, legend, and layer toggles.
3. **Storm Replay** — a simulated 12-hour nor'easter with a pure, property-tested
   counter.
4. **Read aloud** — browser `speechSynthesis`, language-matched voice, plain
   English fallback.
5. **Fridge card** — one-page print layout with a locally generated QR code that
   carries the plan in the URL fragment.

Scoring in `lib/risk-engine` was not changed. The map and the list now share one
helper (`lib/app/planner/rank.ts`) that calls the engine's existing
`outreachPriority`/`rankByPriority`, so the popup and the list can never show
different scores.

How the spec was run: requirements (7 requirements, EARS style), design (with 7
correctness properties), and tasks (8 groups with optional test sub-tasks, all
of which were run). In this session the spec sub-agents and task-status tools
used for specs 1 and 2 were not available, so the three documents were written
directly in the same format and tasks were ticked off in `tasks.md` by hand.

### What the new property tests caught

- **Replay counter** (Properties 1–5): counter equals the sum over ZIPs in
  outage counties; never exceeds the statewide total (40,572); deterministic and
  independent of ZIP order; counts only ZIPs in the dataset, even when a frame
  names a FIPS code with no ZIPs; reports masked ZIPs exactly. These passed on
  the first run, so we ran a **mutation check** to make sure they have teeth: we
  broke the engine on purpose twice and restored it. Counting "restoring"
  counties as outages failed Property 1 (2 tests). Dropping the duplicate-ZIP
  guard failed Property 2's duplicate-records case. Both are realistic bugs: the
  first would overstate the counter after the storm passes, the second would
  double count if a ZIP list were ever merged twice.
- **Plan hash** (Property 6): round-trips any plan using full Unicode graphemes
  (names like "Nguyễn Thị Lan" or Chinese characters). This is why the encoder
  goes through `TextEncoder` bytes before base64: plain `btoa` on a JavaScript
  string throws on any character above U+00FF. The same property checks that
  junk input never throws and that the plan lands only in the fragment, never
  the query string.
- **Spoken plan** (Property 7): for every plan and language, the last two
  utterances are the two fixed safety lines, verbatim, and no utterance is empty.

### Real issues in spec 3

- **Flaky map test (next/dynamic is async).** A planner test clicked the map
  stub's button right after the ranked list rendered. It passed alone but failed
  about one run in ten in the full suite, because `next/dynamic` loads the map
  module asynchronously. Fix: wait for the map (`findByRole`) instead of
  assuming it. Confirmed with 10 back-to-back runs, 0 failures.
- **Battery hours box out of sync on restore.** Wiring the fridge-card restore
  exposed an existing bug: when a plan was restored (from localStorage or a QR
  link), the battery-hours text box stayed at "0" while the card showed the
  stored hours. Fix: keep the text box in step with the stored value whenever
  the plan changes from outside typing. Typing an invalid value never changes
  the plan, so it is never overwritten mid-edit. Covered by the fridge-card
  restore test.
- **Workspace permission on `.kiro/settings/mcp.json`.** Writing the MCP
  registration file was blocked by a workspace permission rule. The exact
  config is in `tools/powerplan-mcp/mcp.json.example`; copy it to
  `.kiro/settings/mcp.json` to register the server with Kiro. The server itself
  was exercised over real MCP stdio throughout the spec.
- **Accessibility hook back on, without the loop.** The hook was re-enabled with
  a prompt that runs `pages.axe.test.tsx` once and reports, and explicitly
  forbids editing files (the edit is what re-triggered it). The axe suite now
  also covers Storm Replay at its busiest hour and the fridge card: no
  violations. One manual WCAG 1.4.13 fix was made to the replay tooltip (it can
  be dismissed with Escape and hovered).

## After spec 3: scoring fix and outreach comparison

### Scoring normalization fix

The MCP check in spec 3 showed that the number of people barely moved a ZIP's
score: the config divided each ZIP's count by the largest **county** total
(6,985) instead of the largest **ZIP** (444), so residents added at most about 6
of 100 points. The fix is one line in `lib/app/planner/scoring-config.ts`: take
the max over ZIP records only. Now the largest ZIP gets 100 points from people
alone, on the same scale as an alert level or an outage. `lib/risk-engine` did
not change.

Honest note on the tests: the request expected every existing property test to
pass unchanged. All did except **Property 11**, which asserted the old rule
itself ("max over ZIP and county records"). That test was updated to the new
rule and now also checks that county totals do not affect the max. Monotonicity,
the zero-dependent bound, the outage bonus, and stable ranking all passed
untouched, as expected for any fixed positive max. The map legend buckets moved
to match the new range (0–29, 30–99, 100–199, 200+).

### Outreach comparison (simulated)

Storm Replay now has an "Outreach comparison" panel: for the current simulated
hour, what share of residents in simulated outage areas are reached by calling
the top 10, 20, or 50 ZIPs in PowerPlan order, random order (average of 500
seeded shuffles), or alphabetical order. The math is a pure module
(`lib/app/replay/outreach.ts`). Property tests cover: coverage never decreases as
N grows (all three orders), coverage stays between 0 and 100%, results are
identical for the same seed, and the sentence only claims an advantage when the
rounded numbers show one.

**The claim "PowerPlan order reaches at least as many as random" — counterexample
found.** We wrote it as a property over generated data with live weather alerts
in the score, and fast-check found a counterexample quickly (seed 7, 1,000 runs).
Shrunk case, N = 10, outages in counties 25001, 25017, 25023:

- Two ZIPs with **Extreme** alerts but only "11 or fewer" residents (02218,
  02684) score 503 and lead the list; three more alerted ZIPs with 11 residents
  follow.
- ZIP 02178 in Suffolk (25025) has a **Moderate** alert but is **outside** the
  simulated outage area. It scores 203 and takes one of the 10 calls.
- ZIP 01210 (204 residents, in outage, no alert) scores 147 and ranks 11th, so it
  is not called.
- Result: PowerPlan order reaches **86%** of affected residents; the random
  average reaches **90%**.

Why: PowerPlan's score is about overall outreach priority (people, alerts, and
outages), not "residents in outage areas only". An alert outside the outage area
legitimately raises a ZIP's priority, but it does not help this particular
measure. We did **not** change scoring to make the claim pass. Instead:

1. The general claim is kept as an expected-counterexample test, so if scoring
   ever changes in a way that removes the counterexample, we will notice.
2. A narrower claim is proven for any data: **with no weather alerts**, PowerPlan
   order reaches at least as many as any order, including every random shuffle
   (an affected ZIP with residents always outscores every unaffected ZIP, and
   affected ZIPs are sorted by residents). 300 runs, no counterexample.
3. The claim is checked on the **real** emPOWER data and the **real** replay
   frames (no alerts in the replay): it holds for every frame and every N, and
   PowerPlan order also beats alphabetical order. Example: at simulated hour 3,
   the top 20 in PowerPlan order reach 58% of affected residents vs 4% in random
   order and 0% alphabetically; at the peak (hour 7) it is 23% vs 4%.
4. The UI sentence is built from the numbers. With live alerts in play it can
   honestly read "...less than the Y% reached in random order this hour."

## Other notable decisions (see `docs/decisions.md`)

- `react-leaflet` v5 installs cleanly against React 19 (v4 does not), so no
  version forcing was needed.
- Vitest keeps a `node` default environment (so the engine suite is unchanged)
  and uses `environmentMatchGlobs` to run `.tsx`/component tests under `jsdom`.
- A `vitest.d.ts` augments the `vitest` module's `Assertion` with the jest-dom
  and `vitest-axe` matchers, so `toBeInTheDocument` and `toHaveNoViolations`
  type-check.

## MCP usage log (spec 3: wow-features)

Every query made to the PowerPlan data MCP server (`tools/powerplan-mcp`) while
building spec 3. Calls go over real MCP stdio through `tools/powerplan-mcp/smoke.mjs`.

1. **Smoke test** — `county_summary("Plymouth")`, `top_zips(limit 3)`,
   `zip_detail("02360")`, `zip_detail("99999")`. Confirmed the three tools, the
   "11 or fewer" label, and that an unknown ZIP returns an error with no numbers.
   Plymouth's ZIP sum (3,662) matched the county CSV exactly.
2. **Centroid gaps** — `zip_detail("02350")` and `zip_detail("02661")`. These are
   the two emPOWER ZIPs with no 2020 Census ZCTA. Both are masked ("11 or
   fewer", 35 and 93 Medicare beneficiaries), so leaving them off the map loses
   no meaningful circle. Logged in `docs/data-notes.md`.
3. **Choosing the Storm Replay path** — `county_summary` for Barnstable,
   Dukes, Nantucket, Plymouth, Bristol, Norfolk, Suffolk, Middlesex, and Essex,
   then `top_zips` (limit 3) for Barnstable, Plymouth, and Suffolk. This set the
   storm's route (islands → Cape → Southeastern MA → Greater Boston, peaking
   over Middlesex, the largest county at 6,985). Essex was left out to keep the
   storm in the east and southeast. The path covers the largest ZIPs
   (Plymouth's 02360 with 444, Suffolk's 02124 with 235).
5. **Checking how the ranking moves** — a one-off script on the MCP data showed
   that ZIPs in simulated outage jump to the top (hour 1: Dukes and Nantucket
   ZIPs lead; hour 7: 02360 Plymouth leads at 106). It also exposed that the
   dependents factor topped out at about 6 points, because the scoring config
   normalized ZIP counts by a max that included county totals (6,985). It was
   flagged in `docs/decisions.md` and fixed afterwards (see "After spec 3").
   It also showed that `zip_sum_power_dependent` equals the county CSV total for
   every county, so county-level frames can be summed from ZIPs safely.
4. **Verifying the replay counter** — `tools/powerplan-mcp/verify-replay.mjs`
   calls `county_summary` for each county in outage in each of the 13 frames
   and compares the MCP totals with the replay engine's counter. All 13 frames
   match, including masked-ZIP counts (peak: about 23,117 residents and 33
   masked ZIPs at simulated hour 7). Statewide ZIP total is 40,572, the ceiling
   the property tests enforce.
