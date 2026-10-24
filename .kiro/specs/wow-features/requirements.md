# Requirements Document

## Introduction

Spec 3 adds demo-quality features on top of the completed `risk-engine` and
`app` specs: a small MCP server over the emPOWER CSVs (used while building this
spec), a ZIP-level map as the hero of `/planner`, a simulated Storm Replay, a
read-aloud control on the Outage Plan card, and a one-page fridge card with a
local QR code. Scoring logic in `lib/risk-engine` does not change. All honesty
rules from steering apply: anything simulated is labeled "Simulated", no
evacuation timing, no medical advice, no claims that shelters have power.

## Glossary

- **MCP_Server**: `tools/powerplan-mcp`, a Node stdio MCP server that reads the CSVs in `data/`.
- **Zip_Centroids**: `public/ma-zip-centroids.json`, lat/lng per MA ZIP from the US Census 2020 ZCTA Gazetteer.
- **Hero_Map**: the Leaflet map on `/planner` with county shading and ZIP circles.
- **Replay_File**: `data/sim-storm-replay.json`, a simulated 12-hour nor'easter as hourly frames.
- **Replay_Engine**: the pure module `lib/app/replay/replay.ts` that turns a frame into affected ZIPs and a counter.
- **Replay_Counter**: the "About N power dependent Medicare residents in simulated outage areas" figure.
- **Read_Aloud**: browser `speechSynthesis` playback of the Outage Plan card.
- **Fridge_Card**: a one-page print layout of the plan with a locally generated QR code.
- **Plan_Hash**: the plan encoded in the URL fragment (after `#`), never sent to a server.

## Requirements

### Requirement 1: PowerPlan data MCP server

**User Story:** As a developer using Kiro, I want an MCP server over our emPOWER CSVs, so that I can query real figures while building and verifying features.

#### Acceptance Criteria

1. THE MCP_Server SHALL communicate over stdio using `@modelcontextprotocol/sdk`.
2. THE MCP_Server SHALL expose a `county_summary(county)` tool returning the county's emPOWER figures.
3. THE MCP_Server SHALL expose a `top_zips(county?, limit)` tool returning ZIPs ranked by `power_dependent_dme`.
4. THE MCP_Server SHALL expose a `zip_detail(zip)` tool returning one ZIP's figures.
5. THE MCP_Server SHALL label a `power_dependent_dme` value of 11 as "11 or fewer".
6. IF a tool receives an unknown county or ZIP, THEN THE MCP_Server SHALL return an error message and no fabricated figures.
7. THE MCP_Server SHALL be registered in `.kiro/settings/mcp.json`.

### Requirement 2: ZIP centroids data

**User Story:** As a planner, I want each ZIP placed on the map, so that I can see where dependent residents live.

#### Acceptance Criteria

1. THE Zip_Centroids file SHALL be derived from the US Census 2020 ZCTA Gazetteer and filtered to ZIPs present in the emPOWER ZIP CSV.
2. THE Zip_Centroids file SHALL contain only ZIP, latitude, and longitude.
3. THE source and any ZIPs without a centroid SHALL be logged in `docs/data-notes.md`.

### Requirement 3: Map as the hero of /planner

**User Story:** As a planner, I want a large, layered map, so that I can see dependents, alerts, and outages at a glance.

#### Acceptance Criteria

1. THE Hero_Map SHALL keep county shading by aggregated power-dependent count.
2. THE Hero_Map SHALL draw one circle per ZIP sized by `power_dependent_dme` and colored by outreach priority.
3. WHERE a ZIP count is masked, THE Hero_Map SHALL show "11 or fewer".
4. WHEN a ZIP circle is clicked, THE Hero_Map SHALL open a popup with ZIP, county, count, score 0 to 100, and active reasons, and THE planner page SHALL highlight that ZIP's ranked-list row.
5. WHEN a ranked-list row is activated, THE Hero_Map SHALL pan to that ZIP.
6. THE Hero_Map SHALL show a legend and layer toggles for Power dependent residents, Weather alerts, and Outages.
7. THE Hero_Map SHALL span the full content width above the ranked list and be at least 60vh tall.
8. THE ranked list SHALL remain the accessible non-map path to the same data.

### Requirement 4: Storm Replay

**User Story:** As a planner, I want to replay a simulated storm hour by hour, so that I can see how outreach priority shifts.

#### Acceptance Criteria

1. THE Replay_File SHALL contain 13 hourly frames (hour 0 to 12) listing affected county FIPS with outage status, moving from the Cape and Islands through Southeastern MA into Greater Boston, then restoring.
2. THE Replay_File and every replay UI element SHALL be labeled "Simulated".
3. THE replay controls SHALL include play, pause, step forward, step back, and a time slider from hour 0 to 12.
4. THE replay SHALL NOT autoplay.
5. WHILE the user prefers reduced motion, THE play control SHALL advance one frame per press without animation.
6. WHEN the frame changes, THE planner page SHALL update county shading, ZIP circles, and the ranked-list order.
7. THE Replay_Counter SHALL equal the sum of `power_dependent_dme` over ZIPs in affected counties.
8. THE Replay_Counter SHALL count masked ZIPs as up to 11 and explain this in a tooltip.
9. THE Replay_Counter SHALL never exceed the statewide total of the dataset.
10. THE Replay_Engine SHALL count only ZIPs present in the dataset.
11. THE Replay_Engine SHALL return identical output for identical input.

### Requirement 5: Read aloud

**User Story:** As a resident with low vision, I want my plan read aloud, so that I can hear it without reading small text.

#### Acceptance Criteria

1. THE Outage Plan card SHALL offer "Read my plan aloud" and "Stop" buttons.
2. THE Read_Aloud SHALL use the browser `speechSynthesis` API with a voice matching the selected language.
3. IF no voice exists for the selected language, THEN THE Read_Aloud SHALL show a plain note and use English.
4. IF the browser has no `speechSynthesis`, THEN THE Read_Aloud controls SHALL explain that read aloud is unavailable.
5. THE Read_Aloud SHALL NOT call any external API.
6. THE spoken text SHALL include both fixed safety lines.

### Requirement 6: Fridge card

**User Story:** As a resident, I want a one-page card for my fridge, so that my plan is visible during an outage.

#### Acceptance Criteria

1. THE Fridge_Card SHALL fit one printed page with large text, devices, battery bar, contacts, safety lines, help numbers, and a QR code.
2. THE QR code SHALL be generated locally with the `qrcode` npm package.
3. THE QR code SHALL encode a `/plan` link with the plan in the URL fragment so it is never sent to a server.
4. WHEN `/plan` is opened with a valid Plan_Hash, THE Resident page SHALL restore the plan.
5. IF the Plan_Hash is malformed, THEN THE Resident page SHALL ignore it and keep the stored plan.
6. THE Fridge_Card SHALL show "This code contains your plan. Share it only with people you trust."

### Requirement 7: Finish

**User Story:** As a judge, I want the features documented and verified, so that I can evaluate them.

#### Acceptance Criteria

1. THE accessibility hook SHALL be enabled and the axe tests SHALL pass with no serious violations.
2. THE README SHALL describe the new features, how to run Storm Replay, and how to use the MCP server.
3. THE Kiro journal SHALL describe spec 3, the MCP server and its uses, and what the new property tests caught.
4. Typecheck, all tests, and the build SHALL pass, and existing tests SHALL keep passing.
