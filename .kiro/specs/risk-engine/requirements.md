# Requirements Document

## Introduction

The Risk Engine is the data and logic layer for PowerPlan, a tool that surfaces where electricity-dependent Medicare beneficiaries live in Massachusetts so outreach teams can prioritize contact during and ahead of power outages. The engine loads three HHS emPOWER CSV datasets (ZIP-level, county-level, and monthly trend), fetches live National Weather Service active alerts for Massachusetts, and reads a simulated-outage file. From these inputs it computes an explainable outreach-priority score per ZIP and a battery-runtime timeline from user-supplied inputs. This specification covers data loading, mapping, scoring, and timeline logic only; no user interface is in scope. The engine must present emPOWER data as aggregated, de-identified Medicare data and must label all simulated data as simulated, never inventing facts.

## Glossary

- **Risk_Engine**: The data-and-logic subsystem that loads datasets, maps weather alerts to geographic areas, computes outreach priority, and computes battery timelines.
- **emPOWER_Loader**: The component that reads and parses the HHS emPOWER CSV datasets into typed records.
- **Alert_Loader**: The component that fetches and parses National Weather Service active alerts for Massachusetts.
- **Outage_Loader**: The component that reads and validates the simulated-outage file.
- **ZIP**: A five-digit United States postal ZIP code stored as text with leading zeros preserved.
- **County_FIPS**: The five-digit federal information processing standard code identifying a Massachusetts county.
- **SAME_Code**: The Specific Area Message Encoding code (a six-digit geographic code whose last five digits correspond to a County_FIPS) used by National Weather Service alerts.
- **power_dependent_dme**: The emPOWER count of Medicare beneficiaries with a recent claim for electricity-dependent durable medical equipment; the primary count used by the Risk_Engine. A value of 11 denotes "11 or fewer."
- **NWS_Alert**: A single active alert record retrieved from the National Weather Service active-alerts endpoint.
- **Severity**: The National Weather Service alert severity category, ordered Extreme > Severe > Moderate > Minor > none.
- **Simulated_Outage**: A record in the simulated-outage file describing an outage affecting a ZIP or county, including whether the outage is active.
- **outreachPriority**: An explainable numeric score for a ZIP representing relative outreach urgency, accompanied by labeled contributing reasons.
- **batteryTimeline**: A pure computation that derives battery-depletion time from a user-supplied battery-runtime duration and outage-start time.
- **Reason**: A labeled, non-negative contribution to an outreachPriority score, describing one signal and its magnitude.
- **Severity_Weight**: A non-negative numeric weight assigned to a Severity category, strictly increasing from none through Extreme.
- **Outage_Bonus**: A non-negative numeric contribution added to outreachPriority when a ZIP is affected by an active outage.

## Requirements

### Requirement 1: Load emPOWER datasets

**User Story:** As an outreach analyst, I want the emPOWER datasets loaded into typed records, so that scoring and reporting operate on validated county and ZIP data.

#### Acceptance Criteria

1. THE emPOWER_Loader SHALL load the ZIP-level dataset from `data/empower_ma_zip_oct2026.csv` into records containing zip, county, county_fips, medicare_benes, power_dependent_dme, esrd_dialysis_any_dme, o2_services_any_dme, home_health_any_dme, hospice_any_dme, healthcare_srvc_any_dme, and pct_power_dependent.
2. THE emPOWER_Loader SHALL load the county-level dataset from `data/empower_ma_county_oct2026.csv` into records containing county_fips, county, medicare_benes, power_dependent_dme, esrd_dialysis_any_dme, o2_services_any_dme, home_health_any_dme, hospice_any_dme, healthcare_srvc_any_dme, and pct_power_dependent.
3. THE emPOWER_Loader SHALL load the monthly dataset from `data/empower_ma_zip_monthly_2026.csv` into records containing zip, county, month, medicare_benes, and power_dependent_dme.
4. THE emPOWER_Loader SHALL preserve each ZIP as a five-digit text value retaining leading zeros.
5. THE emPOWER_Loader SHALL use power_dependent_dme as the primary dependent count for a ZIP.
6. WHERE a power_dependent_dme value equals 11, THE emPOWER_Loader SHALL expose that value with a label indicating "11 or fewer."
7. IF a required column is missing or a numeric field cannot be parsed as a number, THEN THE emPOWER_Loader SHALL reject the affected record with an error identifying the field.
8. THE emPOWER_Loader SHALL label all emPOWER-derived data as aggregated, de-identified Medicare data.

### Requirement 2: Fetch and map NWS alerts

**User Story:** As an outreach analyst, I want live National Weather Service alerts fetched and mapped to Massachusetts ZIPs, so that weather severity can inform outreach priority.

#### Acceptance Criteria

1. WHEN alerts are requested, THE Alert_Loader SHALL fetch active alerts from `https://api.weather.gov/alerts/active?area=MA`.
2. THE Alert_Loader SHALL send a descriptive User-Agent header with each request to the National Weather Service endpoint.
3. WHEN an alert response is received, THE Alert_Loader SHALL cache the parsed result for 5 minutes and serve subsequent requests within that window from the cache.
4. WHEN mapping an NWS_Alert to areas, THE Alert_Loader SHALL resolve the alert to counties using the County_FIPS derived from the alert SAME_Code.
5. WHEN an NWS_Alert is resolved to a county, THE Alert_Loader SHALL fan out the alert to every ZIP whose county_fips matches that county in the emPOWER ZIP dataset.
6. THE Alert_Loader SHALL expose the Severity of each NWS_Alert using the ordering Extreme > Severe > Moderate > Minor > none.
7. IF the National Weather Service request fails or returns an unparseable response, THEN THE Alert_Loader SHALL return an error without emitting fabricated alert data.

### Requirement 3: Load simulated outages

**User Story:** As an outreach analyst, I want simulated outages loaded from a validated file, so that outage scenarios can be tested without claiming they are real.

#### Acceptance Criteria

1. THE Outage_Loader SHALL read simulated outages from `data/sim-outages.json`.
2. THE Outage_Loader SHALL accept an array of records where each record contains a zip or a county, a boolean active field, a start field, and an optional estimatedRestore field.
3. WHEN a simulated-outage record is validated, THE Outage_Loader SHALL confirm the record conforms to the defined schema before accepting the record.
4. IF a simulated-outage record does not conform to the schema, THEN THE Outage_Loader SHALL reject the record with an error identifying the invalid field.
5. THE Outage_Loader SHALL label every Simulated_Outage as simulated.

### Requirement 4: Explainable outreach-priority scoring

**User Story:** As an outreach analyst, I want an explainable outreach-priority score per ZIP, so that I can justify why one area is prioritized over another.

#### Acceptance Criteria

1. WHEN outreachPriority is computed for a ZIP, THE Risk_Engine SHALL compute the score as a weighted additive sum of a normalized dependent-count contribution, a Severity_Weight contribution, and an Outage_Bonus contribution.
2. THE Risk_Engine SHALL normalize the dependent-count contribution using the ZIP power_dependent_dme value.
3. THE Risk_Engine SHALL assign Severity_Weight values that strictly increase across the ordering none, Minor, Moderate, Severe, Extreme.
4. WHERE a ZIP is affected by an active Simulated_Outage or an active NWS_Alert, THE Risk_Engine SHALL add the Outage_Bonus to the score.
5. THE Risk_Engine SHALL return every score contribution as a labeled Reason with a non-negative value.
6. WHEN any single input signal increases while all other signals are held constant, THE Risk_Engine SHALL return an outreachPriority score that is greater than or equal to the previous score.
7. WHEN two ZIPs are identical in all signals except dependent count, THE Risk_Engine SHALL return a score for the ZIP with zero dependents that is less than or equal to the score for the ZIP with a greater dependent count.
8. IF outreachPriority is requested for a ZIP absent from the emPOWER ZIP dataset, THEN THE Risk_Engine SHALL reject the request with an error and SHALL NOT return a score.

### Requirement 5: Stable priority ranking

**User Story:** As an outreach analyst, I want a stable ranking of ZIPs by priority, so that results are reproducible regardless of input ordering.

#### Acceptance Criteria

1. WHEN ZIPs are ranked by outreachPriority, THE Risk_Engine SHALL produce a ranking determined solely by the computed scores.
2. WHEN the same set of ZIPs is supplied in a different input order, THE Risk_Engine SHALL produce the same ranking.

### Requirement 6: Battery-runtime timeline

**User Story:** As an outreach analyst, I want a battery-runtime timeline computed from supplied inputs, so that I can estimate when a dependent's backup power will be exhausted.

#### Acceptance Criteria

1. WHEN batteryTimeline is computed from a battery-runtime duration in hours and an outage-start time, THE Risk_Engine SHALL derive the battery-depletion time using only those two supplied inputs.
2. THE Risk_Engine SHALL return a battery-depletion time that is not earlier than the supplied outage-start time.
3. WHEN the battery-runtime duration increases while the outage-start time is held constant, THE Risk_Engine SHALL return a battery-depletion time that is later than or equal to the previous battery-depletion time.
4. IF batteryTimeline receives a negative battery-runtime duration, THEN THE Risk_Engine SHALL reject the input with an error and SHALL NOT return a depletion time.

### Requirement 7: Property-based test coverage

**User Story:** As a developer, I want the engine covered by property-based tests, so that the scoring and timeline invariants are verified across generated inputs.

#### Acceptance Criteria

1. THE Risk_Engine test suite SHALL use Vitest as the test runner and fast-check for property generation.
2. THE Risk_Engine test suite SHALL verify that outreachPriority is non-decreasing as the dependent count increases while other signals are held constant.
3. THE Risk_Engine test suite SHALL verify that outreachPriority is non-decreasing as Severity increases while other signals are held constant.
4. THE Risk_Engine test suite SHALL verify that a ZIP with zero dependents never scores above an otherwise-identical ZIP with a greater dependent count.
5. THE Risk_Engine test suite SHALL verify that adding an active outage never lowers a ZIP outreachPriority.
6. THE Risk_Engine test suite SHALL verify that ZIP ranking is stable regardless of input order.
7. THE Risk_Engine test suite SHALL verify that a battery-depletion time is never earlier than the outage-start time and increases as battery hours increase.
8. THE Risk_Engine test suite SHALL verify that invalid inputs, including a negative battery-runtime duration and an unknown ZIP, are rejected and never silently scored.

### Requirement 8: Honest data presentation

**User Story:** As a user of PowerPlan, I want all data presented honestly, so that I do not mistake aggregated or simulated figures for individual or real-time facts.

#### Acceptance Criteria

1. THE Risk_Engine SHALL label emPOWER-derived figures as aggregated, de-identified Medicare data.
2. THE Risk_Engine SHALL label every Simulated_Outage and all data derived from simulated outages as simulated.
3. THE Risk_Engine SHALL expose only values present in the loaded datasets, live alerts, and user-supplied inputs, and SHALL NOT emit fabricated facts.
