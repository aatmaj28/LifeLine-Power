# Data Notes

Sources and verified facts the app relies on. Keep this short and cite official
pages only. Never assert a shelter has power, charging, or space.

## Resident help resources (Outage Plan card)

These are the only help resources the resident card shows. Wording is limited to
what these official pages support.

- **Mass 211** — statewide information and referral line for shelter and other
  help. Dial `211` or visit <https://mass211.org>. (We link to Mass 211 for
  current shelter info rather than claiming any shelter status.)
- **911** — for emergencies, including when a device stops and someone is in
  danger.
- **Utility medical / life-support registration** — residents who depend on
  electricity-dependent equipment can register with their utility's medical or
  life-support program:
  - Eversource: <https://www.eversource.com> (customer service / medical
    and life-support programs).
  - National Grid: <https://www.nationalgrid.com> (customer service / life
    support and medical equipment programs).

## emPOWER data (planner)

- HHS emPOWER counts are aggregated, de-identified Medicare data. A reported
  value of `11` means "11 or fewer" (small-cell suppression). Source:
  <https://empowerprogram.hhs.gov>.

## Emergency information (Massachusetts)

- MEMA / Mass.gov emergency information: <https://www.mass.gov/orgs/massachusetts-emergency-management-agency>.

## ZIP centroids (planner map)

- File: `public/ma-zip-centroids.json` — `{ "ZIP": [lat, lng] }`, internal-point
  coordinates rounded to 4 decimals. About 13.6 KB.
- Source: US Census Bureau, 2020 Gazetteer Files, ZIP Code Tabulation Areas
  (`2020_Gaz_zcta_national.zip`, columns `GEOID`, `INTPTLAT`, `INTPTLONG`):
  <https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_zcta_national.zip>.
  Public domain U.S. government data.
- Built with `node tools/build-zip-centroids.mjs <gazetteer.txt>`, filtered to the
  510 ZIPs in `data/empower_ma_zip_oct2026.csv`.
- 508 of 510 ZIPs matched. Two emPOWER ZIPs have no 2020 ZCTA (they are
  PO-box or point ZIPs): `02350` (Plymouth County) and `02661` (Barnstable
  County). Both report "11 or fewer" power-dependent beneficiaries (checked with
  the `zip_detail` tool of the PowerPlan MCP server). They have no circle on the
  map but still appear in the ranked list and in county totals.
- A ZCTA centroid is an approximation of a ZIP's location, not an address.

## Simulated storm replay

- File: `data/sim-storm-replay.json`. A **simulated** 12-hour nor'easter for demo
  purposes only. It is not a forecast and not a record of a real storm or real
  outages. Every replay UI element is labeled "Simulated".
