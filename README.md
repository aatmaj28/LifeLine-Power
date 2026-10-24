# PowerPlan

**Storm prep for people whose lives depend on electricity.**

When a storm knocks out power, most people lose their lights. For someone on an
oxygen concentrator, home dialysis, a ventilator, or a powered wheelchair, an
outage can become a medical emergency within hours. HHS already publishes a risk
map; PowerPlan turns that data into **personal action** for residents and
**prioritized outreach** for planners.

- **Live demo:** _deploy pending — add the Vercel URL here_
- Built for Hackachusetts 2026, Track 03 (Energy & climate tech).

## Who it helps

- **Residents** who rely on powered medical equipment. They get a personal,
  printable, shareable Outage Plan card in their language, with live storm
  alerts for their area.
- **Planners** doing outreach. They get a Massachusetts county map of
  power-dependent Medicare residents, overlaid with active weather alerts, and a
  ranked "where to focus" list.

## Two experiences

### Resident (`/plan`, mobile first)

Enter a ZIP code, the device types you depend on, your backup battery hours, and
up to three emergency contacts. PowerPlan shows:

- Live National Weather Service alerts for your area.
- An **Outage Plan card**: your devices, a plain-language battery timeline
  ("If power goes out at 6 PM, your battery covers about 4 hours, until about
  10 PM, based on what you entered"), your contacts, steps to take before the
  storm, and official help numbers.
- The card is **printable**, **shareable** (native share sheet, with copy and
  print fallbacks), and available in **English, Spanish, Portuguese, Haitian
  Creole, Simplified Chinese, and Vietnamese**.
- **Read my plan aloud** — the browser's own voices read the plan in the
  selected language. If the device has no voice for that language, a plain note
  says so and the English plan is read instead. No external speech service.
- **Fridge card** — a one-page, large-text print layout with the battery bar,
  devices, contacts, safety lines, help numbers, and a QR code. The QR is made
  in the browser and opens `/plan` with the plan stored after the `#` in the
  link, which browsers never send to a server. Scanning it restores the plan on
  another phone. The card says: "This code contains your plan. Share it only
  with people you trust."

Your data stays in your browser (localStorage). No accounts. Only the ZIP code
leaves the browser, for data lookups. (The fridge-card QR is the one place the
plan is put in a link, only when you choose to print it, and only in the part of
the link that is never sent to a server.)

### Planner (`/planner`, desktop)

- **The map is the hero**: full width and at least 60% of the screen tall.
  - The **14 Massachusetts counties** are shaded by the number of Medicare
    beneficiaries who rely on electricity-dependent equipment (HHS emPOWER).
  - **One circle per ZIP** (508 of 510 ZIPs), sized by that count and colored
    by outreach priority. Masked ZIPs show "11 or fewer".
  - Click a circle for a popup (ZIP, county, count, score 0 to 100, active
    reasons); its row in the ranked list is highlighted. Click a ZIP in the list
    and the map pans to it.
  - A legend and three **layer toggles**: Power dependent residents, Weather
    alerts, Outages. A toggle removes that signal from both the map and the
    ranking, so what you see is what is scored.
- A ranked **outreach-priority** list combining dependent population, alert
  severity, and outage status. Each row shows a score **and the reasons**
  behind it. Residents add 0 to 100 points (the largest ZIP gets 100), each
  alert level adds 100, and an active outage adds 100.
- **Storm Scenario** (simulated outages over Eastern MA) and **Storm Replay**
  (a simulated 12-hour nor'easter, hour by hour). Both are always labeled
  "Simulated", and only one runs at a time.

The ranked list is a full, non-map path to the same data, so the dashboard works
without touching the map.

## Screenshots

_Add screenshots of `/plan` (resident card) and `/planner` (map + ranked list)
here before submission._

## Run locally

Requirements: Node 20+ and npm.

```bash
npm install
npm run dev
# open http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm run start      # run the production build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm test           # vitest run (unit + property + axe)
```

## Environment variables

**PowerPlan runs with no configuration.** Translation and plain-language
rewriting use a provider chain that always falls back to built-in English
templates, so every page works with no AI key.

| Variable | Purpose | Required |
|---|---|---|
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` | If set, the translate route will use Amazon Bedrock. | No |
| `AI_API_KEY` | A generic AI key used if Bedrock is not configured. | No |

With none of these set, the app serves English template copy. Safety lines and
the "based on what you entered" label are fixed per-language strings and are
never sent to any AI provider.

## Tests

```bash
npm test
```

- **Vitest** runs the suite; **fast-check** drives property-based tests.
- The risk engine's logic (loaders, scoring, ranking, battery timeline) is
  covered by property tests that check invariants like "more dependents never
  lowers a score" and "ranking is stable regardless of input order".
- The app's pure helpers have their own property tests (envelope mapping, plan
  serialization round-trip, county aggregation, provider-chain resolution, and
  more).
- The Storm Replay engine, plan-hash encoding, and spoken plan have property
  tests too (counter equals the sum over affected ZIPs, never exceeds the
  statewide total, is deterministic, counts only known ZIPs; the plan link
  round-trips any plan, including accented and Chinese names; the spoken plan
  always ends with both safety lines).
- The MCP server has unit tests plus a real stdio round-trip test.
- **axe** accessibility checks run against `/plan`, `/planner` (including Storm
  Replay at its busiest hour), and the fridge card.

- The outreach comparison has property tests (coverage never decreases as N
  grows, stays between 0 and 100%, is identical for the same seed, and the
  sentence never overstates). The claim "PowerPlan order beats random" is proven
  only where it is true (no weather alerts, and the real replay frames); a
  counterexample with alerts is kept as a test and explained in the journal.

Current status: 176 tests across 45 files pass; `typecheck` and `build` are
clean.

> Note: automated axe checks catch many issues but not all. Full WCAG 2.2 AA
> conformance requires manual testing with assistive technologies and expert
> review.

## Scenario mode

On the planner dashboard, toggle **Storm Scenario** to layer a simulated
nor'easter (outages over Eastern Massachusetts) on top of the live emPOWER and
NWS data. This feeds outage status into the outreach-priority scoring so you can
see the ranking shift, and it keeps the demo reliable even when there is no
active real storm. The simulated layer is always labeled "Simulated"; the live
base layers are not.

## Storm Replay (simulated)

1. Open `/planner` and check **Show Storm Replay** under "Storm Scenario".
2. Use **Play**, **Pause**, **Step back**, **Step forward**, or drag the
   **Simulated hour** slider (0 to 12). It never plays on its own.
3. Each hour, the counties and ZIP circles update, the ranked list reorders, and
   a large counter shows "About N power dependent Medicare residents in
   simulated outage areas".

The storm moves from the Islands and Cape Cod through Southeastern MA into
Greater Boston, then power is restored. It peaks at simulated hour 7 with about
23,117 residents in simulated outage areas.

- The scenario is in `data/sim-storm-replay.json`. It is **simulated**: not a
  forecast and not a record of real outages. Every replay element says so.
- Only counties marked "outage" are counted. "Restoring" counties are shown on
  the map (green dashed border) but not counted.
- Masked ZIPs ("11 or fewer") are counted as up to 11. A tooltip explains why
  the counter says "about".
- With reduced motion turned on in your system settings, Play moves one hour per
  press and nothing animates.
- **Outreach comparison (Simulated):** inside Storm Replay, pick Top 10, 20, or
  50. Three bars show what share of residents in simulated outage areas live in
  the ZIPs called, in PowerPlan priority order, random order (average of 500
  seeded shuffles), and alphabetical order, with one plain sentence such as
  "Calling the top 20 ZIPs in PowerPlan order reaches 58% of affected
  residents, vs 4% in random order." The sentence only claims an advantage when
  the numbers show one: when live weather alerts rank ZIPs outside the outage
  area higher, PowerPlan order can reach fewer, and the sentence says so.
- The counter logic is a pure module (`lib/app/replay/replay.ts`) with property
  tests, and `node tools/powerplan-mcp/verify-replay.mjs` cross-checks every
  frame against the MCP server.

## PowerPlan data MCP server

`tools/powerplan-mcp` is a small stdio [MCP](https://modelcontextprotocol.io)
server over the emPOWER CSVs in `data/`. Read-only, no network.

| Tool | What it returns |
|---|---|
| `county_summary(county)` | One county's figures (name like `Plymouth` or FIPS like `25023`), including ZIP totals and masked-ZIP count |
| `top_zips(county?, limit)` | ZIPs ranked by power-dependent count, optionally in one county (limit 1 to 100) |
| `zip_detail(zip)` | One ZIP's figures |

Counts of 11 are labeled "11 or fewer". Unknown counties or ZIPs return an
error, never made-up numbers.

```bash
cd tools/powerplan-mcp && npm install && cd ../..
node tools/powerplan-mcp/smoke.mjs                               # list tools + sample calls
node tools/powerplan-mcp/smoke.mjs top_zips '{"county":"Barnstable","limit":5}'
node tools/powerplan-mcp/verify-replay.mjs                       # check Storm Replay numbers
```

To use it from Kiro, copy `tools/powerplan-mcp/mcp.json.example` to
`.kiro/settings/mcp.json` (or merge its `powerplan-data` entry into your
existing file), then reconnect MCP servers in Kiro.

## Data sources and licenses

- **HHS emPOWER** — Medicare beneficiary counts for electricity-dependent
  durable medical equipment, Massachusetts, October 2026. Aggregated,
  de-identified Medicare data. Source:
  [empowerprogram.hhs.gov](https://empowerprogram.hhs.gov). A reported value of
  `11` means "11 or fewer" (small-cell suppression). See `data/README.md` for
  column details and caveats.
- **National Weather Service** — active alerts via
  `https://api.weather.gov/alerts/active?area=MA`. Public U.S. government data;
  requests send a descriptive User-Agent as NWS asks.
- **County boundaries** — a simplified GeoJSON of the 14 MA counties
  (`public/ma-counties.geojson`), derived from US Census cartographic boundary
  files (public domain), keyed to county FIPS.
- **ZIP locations** — `public/ma-zip-centroids.json`, internal points from the
  US Census Bureau 2020 Gazetteer ZCTA file (public domain), filtered to our
  ZIPs. Two PO-box ZIPs (02350, 02661) have no ZCTA and appear only in the list.
  See `docs/data-notes.md`.
- **Map tiles** — OpenStreetMap, © OpenStreetMap contributors (ODbL).
- **Simulated outages and Storm Replay** — `data/sim-outages.json` and
  `data/sim-storm-replay.json`, authored for this project and always labeled
  "Simulated".
- **Help resources** — Mass 211, 911, and utility medical/life-support
  registration (Eversource, National Grid), verified against official pages and
  cited in `docs/data-notes.md`.

## Honesty and safety rules

These are non-negotiable and built into the product:

- Never claim a shelter has power, charging, or space. Link to Mass 211 for
  current shelter info.
- Never tell a user when to leave, and never give medical advice. Battery
  timelines are labeled "based on what you entered".
- Always show: "If your device stops and you are in danger, call 911." and
  "Talk to your doctor or equipment supplier about your backup plan."
- emPOWER counts are labeled as aggregated, de-identified Medicare data.
- Simulated data is always labeled simulated.
- Every data view shows its source and last-updated time.

## Limitations

- emPOWER is aggregated, de-identified Medicare data. It undercounts people
  under 65 who are not on Medicare, and small counts are masked ("11 or fewer").
- NWS alerts are mapped to areas at the **county** level, so a resident sees the
  active alerts for their county, not a address-precise match.
- Translations beyond the fixed safety strings depend on an AI provider; with no
  key configured, non-English pages fall back to English template copy (the app
  still works fully).
- Automated accessibility checks do not prove full WCAG conformance.
- Outage data in the demo is simulated. PowerPlan does not integrate a live
  utility outage feed.
- ZIP circles sit at Census ZCTA centroids, which approximate a ZIP's location.
- Read-aloud voices depend on the device. Haitian Creole voices are rare, so
  that language usually falls back to English (with a note).
- The fridge-card QR contains the plan, including contact names and phone
  numbers. Anyone who scans it can read them, which is why the card says to
  share it only with people you trust.

## Project layout

```
.kiro/            Steering, specs (risk-engine, app, wow-features), and hooks
app/              Next.js App Router pages and API routes
components/       UI components (map, legend, replay, ranked list, plan card, fridge card, ...)
lib/risk-engine/  Data + logic layer (loaders, scoring, battery timeline)
lib/app/          UI-layer pure helpers (envelope, copy, planner ranking, replay, speech, plan hash)
data/             emPOWER CSVs, simulated outages, simulated storm replay (+ data/README.md)
docs/             decisions, data notes, and the Kiro journal
public/           ma-counties.geojson, ma-zip-centroids.json
tools/            powerplan-mcp (MCP server), build-zip-centroids.mjs
```

## How Kiro was used

This project was built almost entirely through Kiro's spec workflow, steering,
and hooks. See [`docs/kiro-journal.md`](docs/kiro-journal.md) for the full
write-up, including the specific bugs the property-based tests and the build
caught.
