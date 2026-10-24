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

We used exactly **two specs**, matching the plan:

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
   runs the axe accessibility check on the two main pages. **This hook is
   currently disabled** — see "Accessibility hook loop" below.

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

None. This build did not require any MCP servers.

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

## Other notable decisions (see `docs/decisions.md`)

- `react-leaflet` v5 installs cleanly against React 19 (v4 does not), so no
  version forcing was needed.
- Vitest keeps a `node` default environment (so the engine suite is unchanged)
  and uses `environmentMatchGlobs` to run `.tsx`/component tests under `jsdom`.
- A `vitest.d.ts` augments the `vitest` module's `Assertion` with the jest-dom
  and `vitest-axe` matchers, so `toBeInTheDocument` and `toHaveNoViolations`
  type-check.
