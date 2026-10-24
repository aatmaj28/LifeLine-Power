# Requirements Document

## Introduction

PowerPlan is storm-prep software for people whose lives depend on electricity (oxygen concentrators, home dialysis, ventilators, powered wheelchairs, and similar equipment). This spec covers the Next.js (App Router) user interface and its server-side API routes, built on top of the already-completed `lib/risk-engine` library. The UI layer consumes the risk-engine public API and does not re-implement loaders, scoring, or battery logic.

The app provides two experiences: a mobile-first resident flow at `/plan` that turns personal input into a printable, shareable, multi-language Outage Plan card, and a desktop planner dashboard at `/planner` that shows a Massachusetts county choropleth of power-dependent Medicare beneficiaries overlaid with live National Weather Service alerts and a ranked outreach-priority list. A landing page at `/` routes residents and planners to their respective experiences.

Honesty, plain-language, and accessibility are first-class requirements: every data view labels its source and last-updated time, simulated content is always badged, resident data stays in the browser, no medical advice or evacuation timing is given, fixed safety lines always appear, and all pages target WCAG 2.2 AA.

## Glossary

- **App**: The PowerPlan Next.js application (App Router, TypeScript, Tailwind), including its pages and server-side API routes.
- **Risk_Engine**: The completed `lib/risk-engine` library, consumed via its public API (`loadEmpowerDataset`, `fetchActiveAlerts`, `parseNwsResponse`, `mapAlertsToZips`, `compareSeverity`, `SEVERITY_ORDER`, `loadSimulatedOutages`, `validateOutages`, `outreachPriority`, `rankByPriority`, `batteryTimeline`, `makeSmallCount`, and exported types).
- **Empower_Route**: The server API route that returns the emPOWER dataset via `loadEmpowerDataset`.
- **Alerts_Route**: The server API route that returns live NWS alerts via `fetchActiveAlerts`.
- **Outages_Route**: The server API route that returns simulated outages via `loadSimulatedOutages`.
- **Translate_Route**: The server API route that returns translated and plain-language resident copy.
- **Landing_Page**: The page served at `/`.
- **Resident_Page**: The mobile-first page served at `/plan`.
- **Planner_Page**: The desktop dashboard page served at `/planner`.
- **Outage_Plan_Card**: The resident-facing result card produced on the Resident_Page.
- **County_Choropleth**: The Massachusetts county map on the Planner_Page, colored by aggregated `power_dependent_dme` per county.
- **Ranked_List**: The outreach-priority list produced via `outreachPriority` and `rankByPriority`, serving as the non-map alternative to the County_Choropleth.
- **Storm_Scenario_Mode**: A toggle on the Planner_Page that adds a simulated outage layer on top of live data and feeds `hasActiveOutage` into scoring.
- **Template_Catalog**: A typed English string catalog that is the no-AI source of truth for resident-facing copy.
- **Fixed_Safety_Lines**: The two required sentences — "If your device stops and you are in danger, call 911." and "Talk to your doctor or equipment supplier about your backup plan." — stored as fixed per-language strings and never sent to an AI service.
- **Based_On_Input_Label**: The fixed per-language label "based on what you entered" applied to battery timelines.
- **Small_Count**: A `SmallCount` value from the Risk_Engine; a value of 11 is displayed as "11 or fewer".
- **Supported_Language**: One of English, Spanish, Portuguese, Haitian Creole, Simplified Chinese, or Vietnamese.
- **Scoring_Config**: The `ScoringConfig` passed to `outreachPriority`, using a fixed dataset-wide `dependentMax` and a strictly-increasing `severityWeight`.

## Requirements

### Requirement 1: Consume the Risk Engine public API

**User Story:** As a developer, I want the App to consume the Risk_Engine public API rather than re-implement data or scoring, so that honesty guarantees and tested logic are preserved in the UI layer.

#### Acceptance Criteria

1. THE App SHALL import emPOWER loading, alert fetching, outage loading, scoring, ranking, battery-timeline, and small-count behavior from the Risk_Engine public API.
2. THE App SHALL NOT re-implement emPOWER loading, alert parsing, outage validation, scoring, ranking, or battery-timeline computation in the UI layer.
3. WHERE the Risk_Engine returns a `Result` error, THE App SHALL surface the error code and message to the calling layer without substituting fabricated data.

### Requirement 2: Server-side API routes with caching

**User Story:** As a resident or planner, I want server-side API routes for data that must run on the server, so that the filesystem-backed emPOWER data and live alerts load correctly and are cached.

#### Acceptance Criteria

1. THE Empower_Route SHALL return the emPOWER dataset by calling `loadEmpowerDataset` on the server.
2. THE Alerts_Route SHALL return live Massachusetts NWS alerts by calling `fetchActiveAlerts` on the server.
3. THE Outages_Route SHALL return simulated outages by calling `loadSimulatedOutages` on the server.
4. WHEN a successful response is produced, THE Empower_Route, THE Alerts_Route, and THE Outages_Route SHALL serve a cached result for up to 5 minutes before refreshing from the Risk_Engine.
5. IF the Risk_Engine returns a `FETCH_FAILED` error, THEN THE Alerts_Route SHALL respond with an error status and the error code without returning fabricated alerts.
6. IF the Risk_Engine returns an `UNPARSEABLE_RESPONSE` error, THEN THE Alerts_Route SHALL respond with an error status and the error code without returning fabricated alerts.
7. IF the Risk_Engine returns a `MISSING_COLUMN`, `PARSE_ERROR`, or `SCHEMA_ERROR` error, THEN THE Empower_Route or THE Outages_Route SHALL respond with an error status and the error code without returning fabricated data.

### Requirement 3: Landing page routing

**User Story:** As a visitor, I want a landing page that explains who PowerPlan is for and routes me to the right experience, so that I can reach either the resident flow or the planner dashboard.

#### Acceptance Criteria

1. THE Landing_Page SHALL display a description of who PowerPlan is for.
2. THE Landing_Page SHALL provide a control that navigates to the Resident_Page.
3. THE Landing_Page SHALL provide a control that navigates to the Planner_Page.

### Requirement 4: Resident input and browser-only storage

**User Story:** As a resident, I want to enter my ZIP, device types, backup battery hours, and emergency contacts, so that I can build a personal outage plan without creating an account.

#### Acceptance Criteria

1. THE Resident_Page SHALL accept a ZIP code, one or more device types, and a backup-battery-hours value entered by the resident.
2. THE Resident_Page SHALL accept up to 3 emergency contacts, each with a name and a phone number.
3. THE Resident_Page SHALL store all resident-entered data in browser localStorage only.
4. THE Resident_Page SHALL transmit only the ZIP code to the server for data lookups.
5. THE Resident_Page SHALL operate without any user account or server-side storage of resident-entered data.
6. IF the resident enters a backup-battery-hours value below 0, THEN THE Resident_Page SHALL reject the value and prompt for a non-negative value.

### Requirement 5: Live alerts and the Outage Plan card

**User Story:** As a resident, I want to see live storm alerts and a personal Outage Plan card, so that I know my situation and what to do before the storm.

#### Acceptance Criteria

1. WHEN a resident provides a ZIP code, THE Resident_Page SHALL display the live NWS alerts affecting that ZIP, obtained via the Alerts_Route.
2. THE Outage_Plan_Card SHALL display the resident's device types, backup battery hours, emergency contacts, steps to take before the storm, and official help numbers.
3. THE Outage_Plan_Card SHALL display a battery timeline computed via `batteryTimeline` and label the timeline with the Based_On_Input_Label.
4. THE Outage_Plan_Card SHALL display both Fixed_Safety_Lines.
5. THE Outage_Plan_Card SHALL NOT display medical advice or guidance on when to evacuate.
6. THE Resident_Page SHALL provide a print-friendly rendering of the Outage_Plan_Card.
7. WHEN the resident requests sharing and the browser provides a native share capability, THE Resident_Page SHALL invoke the native share capability for the Outage_Plan_Card.
8. WHERE the browser provides no native share capability, THE Resident_Page SHALL provide a copy-to-clipboard control and a print control as the share fallback.
9. THE Resident_Page SHALL build share and copy content from the resident's browser-held data without encoding resident data into a URL.

### Requirement 6: Translation and plain-language copy

**User Story:** As a resident who speaks a language other than English, I want the resident copy in my language, so that I can understand my plan.

#### Acceptance Criteria

1. THE Resident_Page SHALL provide a language picker offering each Supported_Language.
2. THE Template_Catalog SHALL provide the English source copy for all resident-facing strings.
3. WHEN a resident selects a Supported_Language, THE Resident_Page SHALL request translated copy from the Translate_Route and render the returned copy.
4. WHEN the Translate_Route receives a request and AWS environment variables are set, THE Translate_Route SHALL attempt translation via Amazon Bedrock.
5. IF Amazon Bedrock is unavailable and a generic AI key is set, THEN THE Translate_Route SHALL attempt translation via the generic AI provider.
6. IF no AI provider is configured or every configured AI provider fails, THEN THE Translate_Route SHALL return the English Template_Catalog copy.
7. THE Translate_Route SHALL supply the Fixed_Safety_Lines and the Based_On_Input_Label from fixed per-language strings and SHALL NOT send those strings to any AI provider.
8. WHEN the Translate_Route returns copy for a Supported_Language, THE Translate_Route SHALL cache the result per language and reuse the cached result for subsequent requests in that language.
9. WHILE no AI provider is configured, THE Resident_Page SHALL render every page and the Outage_Plan_Card using English Template_Catalog copy without error.

### Requirement 7: Planner map, ranked list, and scoring

**User Story:** As a planner, I want a Massachusetts county map of power-dependent beneficiaries overlaid with active alerts, with a ranked list alternative, so that I can see where to focus outreach.

#### Acceptance Criteria

1. THE Planner_Page SHALL display a County_Choropleth of the 14 Massachusetts counties colored by the aggregated `power_dependent_dme` per county.
2. THE Planner_Page SHALL overlay active NWS alerts, obtained via the Alerts_Route, onto the County_Choropleth.
3. WHEN a planner selects a county on the County_Choropleth, THE Planner_Page SHALL display the Ranked_List of ZIPs for that county.
4. THE Planner_Page SHALL display the Ranked_List as a non-map alternative that provides the same outreach-priority data as the County_Choropleth.
5. THE Planner_Page SHALL compute the Ranked_List using `outreachPriority` and `rankByPriority`.
6. THE Ranked_List SHALL display, for each ranked ZIP, the outreach-priority score and the reasons that contributed to the score.
7. THE Planner_Page SHALL build the Scoring_Config with a fixed dataset-wide `dependentMax` and a strictly-increasing `severityWeight`.

### Requirement 8: Storm Scenario mode

**User Story:** As a planner, I want a clearly labeled Storm Scenario mode that adds simulated outages on top of live data, so that the demo always shows outage-driven prioritization without hiding the live baseline.

#### Acceptance Criteria

1. WHILE Storm_Scenario_Mode is off, THE Planner_Page SHALL display live emPOWER data and live NWS alerts as the base layer.
2. WHEN a planner turns Storm_Scenario_Mode on, THE Planner_Page SHALL add a simulated-outage layer, obtained via the Outages_Route, on top of the live base layer.
3. WHILE Storm_Scenario_Mode is on, THE Planner_Page SHALL set `hasActiveOutage` for ZIPs affected by an active simulated outage when computing the Ranked_List.
4. THE Planner_Page SHALL display a "Simulated" badge on the simulated-outage layer only.

### Requirement 9: Honest data labeling

**User Story:** As any user, I want honest labeling of every data view, so that I can trust what is real, what is aggregated, and what is simulated.

#### Acceptance Criteria

1. THE App SHALL display the data source and the last-updated time on every data view.
2. WHERE content is simulated, THE App SHALL display a "Simulated" badge on that content.
3. THE Planner_Page SHALL label emPOWER figures as aggregated, de-identified Medicare data.
4. WHERE a Small_Count has a value of 11, THE App SHALL display the count as "11 or fewer".
5. THE App SHALL display both Fixed_Safety_Lines on the Resident_Page and SHALL NOT display medical advice or evacuation-timing guidance anywhere.

### Requirement 10: Accessibility (WCAG 2.2 AA)

**User Story:** As a user with a disability or an older user, I want the pages to meet accessibility standards, so that I can use PowerPlan regardless of ability.

#### Acceptance Criteria

1. THE Resident_Page and THE Planner_Page SHALL conform to WCAG 2.2 AA.
2. THE Planner_Page SHALL provide the Ranked_List as a non-map path to the outreach-priority data so that map interaction is not the only path to the data.
3. THE App SHALL provide an accessible name for every interactive control, including map controls and icon-only buttons.
4. THE App SHALL provide a visible focus indicator on every interactive control.
5. THE App SHALL pass automated axe accessibility checks on the Resident_Page and the Planner_Page.
6. WHERE a user prefers reduced motion, THE App SHALL honor the reduced-motion preference and SHALL NOT convey essential information through animation alone.
