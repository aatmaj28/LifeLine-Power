---
inclusion: always
---

# PowerPlan — Tech & Conventions

## Stack
- Next.js (App Router) + TypeScript + Tailwind, deployed on Vercel.
- Map: Leaflet (react-leaflet) with OpenStreetMap tiles.
- Server side API routes for NWS and emPOWER calls, cached about 5 minutes.
- Tests: Vitest + fast-check (property based tests). Run axe accessibility
  checks on the two main pages.

## Risk engine
- The data + logic layer already lives in `lib/risk-engine/` (loaders, scoring,
  battery timeline). Import the public API from `lib/risk-engine`. Do not
  re-implement loaders or scoring in the UI layer.

## Translation and plain language
- One interface for translation + plain-language rewriting. Use Amazon Bedrock
  if AWS env vars are set, otherwise any provided AI key, otherwise English
  templates.
- **The app must fully work with no AI key.** Never let a missing key break a
  page; fall back to English template strings.
- Translations are cached per language.

## Conventions
- Keep tasks small, reuse existing code, do not over engineer.
- Data source and last updated time shown on every data view. "Simulated" badge
  on anything simulated.
- Commit messages: short and plain. No AI tool names or attribution.
- Log notable decisions in `docs/decisions.md`; data findings in
  `docs/data-notes.md`; Kiro usage in `docs/kiro-journal.md`.
