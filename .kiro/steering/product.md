---
inclusion: always
---

# PowerPlan — Product

**Storm prep for people whose lives depend on electricity.**

When a storm knocks out power, most people lose their lights. For someone on an
oxygen concentrator, home dialysis, a ventilator, or a powered wheelchair, an
outage can become a medical emergency within hours. HHS already publishes a risk
map; PowerPlan turns that data into **personal action** for residents and
**prioritized outreach** for planners.

## Two experiences

### A. Resident (mobile first)
- Enter ZIP code, device type(s), backup battery hours (user entered), and up to
  3 emergency contacts (names and phone numbers stay in the browser only).
- See live storm alerts for their area from the National Weather Service.
- Get a personal **Outage Plan card**: their devices, battery hours, a simple
  battery timeline ("If power goes out at 6 PM, your battery covers about 4
  hours, until about 10 PM, based on what you entered"), backup contacts, steps
  to take before the storm, and official help numbers.
- Card is printable and shareable, and available in English, Spanish,
  Portuguese, Haitian Creole, Simplified Chinese, and Vietnamese.

### B. Planner dashboard (desktop)
- Massachusetts map showing, per ZIP (or per county if ZIP shapes are too
  heavy), the number of Medicare beneficiaries who rely on electricity dependent
  equipment (HHS emPOWER), overlaid with active NWS alerts.
- Ranked "outreach priority" list combining dependent population, alert
  severity, and outage status.
- A clearly labeled **Storm Scenario** mode that simulates a nor'easter with
  outages over Eastern MA, so the demo always works.

## Honesty and safety rules (non negotiable)
- Never claim a shelter has power, device charging, or space. Link to Mass 211
  for current shelter info.
- Never tell a user when to leave or give medical advice. Battery timelines are
  labeled "based on what you entered."
- Always show: "If your device stops and you are in danger, call 911." and
  "Talk to your doctor or equipment supplier about your backup plan."
- emPOWER counts are aggregated Medicare data; say so on the planner page.
- Simulated data is always labeled as simulated.
- Resident data stays in localStorage only. No accounts. No data leaves the
  browser except the ZIP code for lookups.
