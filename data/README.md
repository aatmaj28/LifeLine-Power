# PowerPlan data: HHS emPOWER (Massachusetts)

Source: HHS emPOWER Map Historical Dataset 2026 (empowerprogram.hhs.gov/about-empowermap.html), ZIP and County sheets, filtered to Massachusetts. Latest month in the file: October 2026.

## Files

- `empower_ma_zip_oct2026.csv`: 510 MA ZIP codes, October 2026, sorted by `power_dependent_dme` (highest first)
- `empower_ma_county_oct2026.csv`: 14 MA counties, October 2026
- `empower_ma_zip_monthly_2026.csv`: Jan to Oct 2026 per ZIP (medicare_benes, power_dependent_dme) for trend charts

## Columns

- `zip`: five digit ZIP, stored as text (keep leading zeros)
- `county`, `county_fips`
- `medicare_benes`: living Medicare beneficiaries in the ZIP
- `power_dependent_dme`: beneficiaries with a recent claim for electricity dependent equipment: ventilator, BiPAP, enteral feeding tube, IV infusion pump, suction pump, power wheelchair, scooter, or electric bed (last 13 months), oxygen concentrator (last 36 months), at home dialysis (last 3 months), or cardiac devices (last 5 years). **This is the main column for PowerPlan.**
- `esrd_dialysis_any_dme`, `o2_services_any_dme`, `home_health_any_dme`, `hospice_any_dme`, `healthcare_srvc_any_dme`: at risk combination counts (people who rely on that health service AND have any electricity dependent equipment). The official dictionary does not define these in detail; describe them in the UI as "also relies on dialysis / oxygen services / home health / hospice."
- `pct_power_dependent`: power_dependent_dme / medicare_benes × 100 (computed by us)

## Caveats (show these honestly in the app)

- Aggregated, de identified Medicare data only. No individuals, no addresses. Undercounts people under 65 who aren't on Medicare.
- Small counts appear to be masked: the value 11 shows up far more often than any nearby number, and ZIP totals add up slightly higher than the state total (40,572 vs 40,222). Treat 11 as "11 or fewer" in the UI.
- Statewide October 2026: 1,495,297 Medicare beneficiaries, 40,222 power dependent.
