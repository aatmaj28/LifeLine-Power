# Implementation Plan: Wow Features

## Overview

Build in priority order: MCP server first (and use it), then the hero map, Storm
Replay, read aloud, fridge card, and the finish pass. Each item is finished
fully before the next starts. Scoring logic in `lib/risk-engine` is not changed.

## Tasks

- [x] 1. PowerPlan data MCP server
  - [x] 1.1 Create `tools/powerplan-mcp` with `lib.mjs` (CSV parsing + queries) and `server.mjs` (stdio tools `county_summary`, `top_zips`, `zip_detail`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
  - [x] 1.2 Register the server in `.kiro/settings/mcp.json`
    - Note: writing `.kiro/settings/` was blocked by a workspace permission rule; the exact config is in `tools/powerplan-mcp/mcp.json.example`
    - _Requirements: 1.7_
  - [x]* 1.3 Write unit tests for the MCP query helpers and a stdio smoke test
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Map as the hero of /planner
  - [x] 2.1 Build `public/ma-zip-centroids.json` from the Census 2020 ZCTA Gazetteer; log source and gaps in `docs/data-notes.md`
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 2.2 Extend `components/CountyChoropleth.tsx` and add `components/MapLegend.tsx`: county shading, ZIP circles, popup, legend, layer toggles, flyTo on selection
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_
  - [x] 2.3 Wire `/planner`: map full width above the list (>= 60vh), shared ZIP selection, row highlight, row activation pans the map
    - _Requirements: 3.4, 3.5, 3.7, 3.8_
  - [x]* 2.4 Write tests for row selection, highlight, and layer toggles
    - _Requirements: 3.4, 3.5, 3.6_

- [x] 3. Checkpoint - Ensure all tests pass

- [x] 4. Storm Replay
  - [x] 4.1 Author `data/sim-storm-replay.json` (13 hourly frames, simulated); pick demo areas with the MCP server
    - _Requirements: 4.1, 4.2_
  - [x] 4.2 Implement pure `lib/app/replay/replay.ts`
    - _Requirements: 4.7, 4.8, 4.9, 4.10, 4.11_
  - [x]* 4.3 Property test: counter equals the sum over affected ZIPs
    - **Property 1** — **Validates: Requirements 4.7**
  - [x]* 4.4 Property test: counter never exceeds the statewide total
    - **Property 2** — **Validates: Requirements 4.9**
  - [x]* 4.5 Property test: replay is deterministic
    - **Property 3** — **Validates: Requirements 4.11**
  - [x]* 4.6 Property test: only known ZIPs are counted
    - **Property 4** — **Validates: Requirements 4.10**
  - [x]* 4.7 Property test: masked count is reported
    - **Property 5** — **Validates: Requirements 4.8**
  - [x] 4.8 Implement `components/StormReplay.tsx` and wire it into `/planner` (map, list, counter update per frame); verify counter numbers with the MCP server
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_
  - [x]* 4.9 Write component tests for replay controls, no autoplay, reduced motion, and the Simulated label
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [x] 5. Checkpoint - Ensure all tests pass

- [x] 6. Read aloud
  - [x] 6.1 Implement pure `lib/app/speech.ts` (`buildSpokenPlan`, `pickVoice`) and `components/ReadAloud.tsx`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [x]* 6.2 Property test: spoken plan always includes both safety lines
    - **Property 7** — **Validates: Requirements 5.6**
  - [x]* 6.3 Write component tests for read aloud, stop, voice fallback, and no-speech support
    - _Requirements: 5.1, 5.3, 5.4_

- [x] 7. Fridge card
  - [x] 7.1 Implement pure `lib/app/plan-hash.ts` and restore-from-hash on `/plan`
    - _Requirements: 6.3, 6.4, 6.5_
  - [x]* 7.2 Property test: plan hash round-trips and never throws
    - **Property 6** — **Validates: Requirements 6.3, 6.4, 6.5**
  - [x] 7.3 Implement `components/FridgeCard.tsx` (one-page print layout, local QR, trust note) and a "Print fridge card" control
    - _Requirements: 6.1, 6.2, 6.6_
  - [x]* 7.4 Write component tests for the fridge card and hash restore
    - _Requirements: 6.1, 6.4, 6.6_

- [x] 8. Finish
  - [x] 8.1 Re-enable the accessibility hook, run axe, fix serious issues
    - _Requirements: 7.1_
  - [x] 8.2 Update README and the Kiro journal
    - _Requirements: 7.2, 7.3_
  - [x] 8.3 Final checkpoint: typecheck, all tests, build; commit and push
    - _Requirements: 7.4_

## Notes

- Tasks marked `*` are optional tests; this run executes all of them.
- Property tests run at least 100 iterations each.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3"] },
    { "id": 4, "tasks": ["2.4", "4.1", "4.2"] },
    { "id": 5, "tasks": ["4.3", "4.4", "4.5", "4.6", "4.7", "4.8"] },
    { "id": 6, "tasks": ["4.9", "6.1", "7.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "7.2", "7.3"] },
    { "id": 8, "tasks": ["7.4", "8.1"] },
    { "id": 9, "tasks": ["8.2", "8.3"] }
  ]
}
```
