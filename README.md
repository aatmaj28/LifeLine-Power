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

Your data stays in your browser (localStorage). No accounts. Only the ZIP code
leaves the browser, for data lookups.

### Planner (`/planner`, desktop)

- A choropleth of the **14 Massachusetts counties** colored by the number of
  Medicare beneficiaries who rely on electricity-dependent equipment (HHS
  emPOWER), overlaid with active NWS alerts. Click a county to drill into its
  ZIPs.
- A ranked **outreach-priority** list combining dependent population, alert
  severity, and outage status. Each row shows the score **and the reasons**
  behind it.
- A clearly labeled **Storm Scenario** mode that layers a simulated nor'easter
  over Eastern Massachusetts on top of the live data, so the demo always shows
  outage-driven prioritization. The simulated layer is always badged
  "Simulated".

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
- **axe** accessibility checks run against the two main pages (`/plan` and
  `/planner`).

Current status: 113 tests across 34 files pass; `typecheck` and `build` are
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
- **Map tiles** — OpenStreetMap, © OpenStreetMap contributors (ODbL).
- **Simulated outages** — `data/sim-outages.json`, authored for this project and
  always labeled "Simulated".
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

## Project layout

```
.kiro/            Steering, specs (risk-engine, app), and hooks
app/              Next.js App Router pages and API routes
components/       UI components (map, ranked list, plan card, badges, ...)
lib/risk-engine/  Data + logic layer (loaders, scoring, battery timeline)
lib/app/          UI-layer pure helpers (envelope, cache, copy, planner helpers)
data/             emPOWER CSVs + simulated outages (+ data/README.md)
docs/             decisions, data notes, and the Kiro journal
public/           ma-counties.geojson
```

## How Kiro was used

This project was built almost entirely through Kiro's spec workflow, steering,
and hooks. See [`docs/kiro-journal.md`](docs/kiro-journal.md) for the full
write-up, including the specific bugs the property-based tests and the build
caught.
