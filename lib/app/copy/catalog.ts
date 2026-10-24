// lib/app/copy/catalog.ts
//
// The English Template_Catalog: the no-AI source of truth for every
// resident-facing string the `/plan` page and the Outage Plan card need.
//
// This catalog is the floor the whole translation stack rests on. When no AI
// provider is configured, or when every provider fails, the app renders these
// English strings and keeps working (Requirement 6.9). `resolveCopy`
// (task 6.4) starts from this catalog, overlays any AI copy, then overlays the
// fixed per-language strings last.
//
// What belongs here: plain-language copy that MAY be translated by an AI
// provider — page chrome, form labels, card headings, step text, help-resource
// labels, honest-labeling strings, and button labels.
//
// What does NOT belong here (and must never be AI-translated): the two fixed
// safety lines and the "based on what you entered" label. Those live in
// `fixed-strings.ts` (task 6.3) so they are supplied verbatim per language and
// never sent to a provider.
//
// Copy follows the plain-language rules: about a 6th-grade reading level, short
// calm sentences, one idea each, and always a clear next action. No medical
// advice and no evacuation timing. Verified help numbers and links are NOT
// baked in here; they are rendered with the card and cited in
// `docs/data-notes.md` — this catalog only provides the human-readable labels.

/**
 * Every resident-facing copy key the app resolves. A string-literal union so
 * the catalog, the resolver, and tests all share one exhaustive key space and
 * a missing or misspelled key is a compile error.
 */
export type CopyKey =
  // --- Page chrome -----------------------------------------------------------
  | "page.title"
  | "page.intro"
  // --- Form labels -----------------------------------------------------------
  | "form.zip.label"
  | "form.deviceTypes.label"
  | "form.batteryHours.label"
  | "form.contactName.label"
  | "form.contactPhone.label"
  | "form.addContact.label"
  | "form.language.label"
  | "form.seeMyPlan.action"
  // --- Card section headings -------------------------------------------------
  | "card.devices.heading"
  | "card.batteryTimeline.heading"
  | "card.contacts.heading"
  | "card.stepsBeforeStorm.heading"
  | "card.helpNumbers.heading"
  // --- Steps before the storm ------------------------------------------------
  | "steps.charge"
  | "steps.callContacts"
  | "steps.prepareSupplies"
  | "steps.keepDevicesClose"
  // --- Help resource labels (labels only; numbers/links live with the card) --
  | "help.mass211.label"
  | "help.call911.label"
  | "help.utilityRegistration.label"
  // --- Honest data labeling --------------------------------------------------
  | "label.dataSource"
  | "label.lastUpdated"
  | "label.simulated"
  // --- Share / copy / print controls -----------------------------------------
  | "action.share"
  | "action.copy"
  | "action.print"
  // --- Small-count note ------------------------------------------------------
  | "note.smallCount";

/**
 * The English source copy for every {@link CopyKey}. Every value is a
 * non-empty string (Property 7). Keep the tone calm and the sentences short;
 * end guidance with a concrete next step.
 */
export const EN_CATALOG: Record<CopyKey, string> = {
  // --- Page chrome -----------------------------------------------------------
  "page.title": "Your storm power plan",
  "page.intro":
    "Make a simple plan for your power. Enter your ZIP code and the devices you depend on. We will show your storm alerts and a plan you can print or share.",

  // --- Form labels -----------------------------------------------------------
  "form.zip.label": "ZIP code",
  "form.deviceTypes.label": "Devices you depend on",
  "form.batteryHours.label": "Backup battery hours",
  "form.contactName.label": "Contact name",
  "form.contactPhone.label": "Contact phone number",
  "form.addContact.label": "Add a contact",
  "form.language.label": "Language",
  "form.seeMyPlan.action": "See my plan",

  // --- Card section headings -------------------------------------------------
  "card.devices.heading": "Your devices",
  "card.batteryTimeline.heading": "Your battery timeline",
  "card.contacts.heading": "Your contacts",
  "card.stepsBeforeStorm.heading": "Steps to take before the storm",
  "card.helpNumbers.heading": "Official help numbers",

  // --- Steps before the storm ------------------------------------------------
  "steps.charge": "Charge your devices and backup batteries now.",
  "steps.callContacts":
    "Call your contacts. Tell them your plan and when to check on you.",
  "steps.prepareSupplies":
    "Keep flashlights, water, and any supplies you need within reach.",
  "steps.keepDevicesClose":
    "Keep your devices and chargers close, where you can find them in the dark.",

  // --- Help resource labels --------------------------------------------------
  "help.mass211.label": "Mass 211 (shelter and help info)",
  "help.call911.label": "911 (emergencies)",
  "help.utilityRegistration.label":
    "Your utility's medical or life-support registration",

  // --- Honest data labeling --------------------------------------------------
  "label.dataSource": "Data source",
  "label.lastUpdated": "Last updated",
  "label.simulated": "Simulated",

  // --- Share / copy / print controls -----------------------------------------
  "action.share": "Share",
  "action.copy": "Copy",
  "action.print": "Print",

  // --- Small-count note ------------------------------------------------------
  "note.smallCount": "11 or fewer",
};

/**
 * All copy keys, for iteration and tests. Derived from {@link EN_CATALOG} so it
 * stays in sync with the catalog automatically.
 */
export const CATALOG_KEYS: CopyKey[] = Object.keys(EN_CATALOG) as CopyKey[];

/**
 * Returns the English source copy for a key. Always a non-empty string, because
 * the catalog is typed to cover every {@link CopyKey}.
 *
 * @param key the resident copy key to look up.
 * @returns the English copy for `key`.
 */
export function getEnglishCopy(key: CopyKey): string {
  return EN_CATALOG[key];
}
