// lib/app/speech.ts
//
// Pure helpers for reading the Outage Plan aloud with the browser's
// speechSynthesis API. No network, no external service: the browser's own
// voices do the speaking.
//
// - buildSpokenPlan turns the plan + resolved copy into plain sentences. It
//   always ends with both fixed safety lines.
// - pickVoice chooses a voice for the selected language and reports when it had
//   to fall back to English (so the UI can say so plainly).

import type { ResolvedCopy } from "./copy/resolve";
import type { ResidentPlan, SupportedLanguage } from "./plan-storage";

/** BCP-47 tag used for each supported language's utterances. */
export const SPEECH_LANG: Record<SupportedLanguage, string> = {
  en: "en-US",
  es: "es-US",
  pt: "pt-BR",
  ht: "ht-HT",
  "zh-Hans": "zh-CN",
  vi: "vi-VN",
};

/** English names, for the plain "no voice for this language" note. */
export const LANGUAGE_NAME: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  ht: "Haitian Creole",
  "zh-Hans": "Simplified Chinese",
  vi: "Vietnamese",
};

/** Help resources read aloud (same verified wording as the card). */
const SPOKEN_HELP: ReadonlyArray<{ key: keyof ResolvedCopy["catalog"]; detail: string }> = [
  { key: "help.mass211.label", detail: "Dial 211 or visit mass211.org." },
  { key: "help.call911.label", detail: "Call 911 in an emergency." },
  {
    key: "help.utilityRegistration.label",
    detail: "Ask your utility, such as Eversource or National Grid, about their medical or life-support program.",
  },
];

const STEP_KEYS: ReadonlyArray<keyof ResolvedCopy["catalog"]> = [
  "steps.charge",
  "steps.callContacts",
  "steps.prepareSupplies",
  "steps.keepDevicesClose",
];

function sentence(text: string): string {
  const t = text.trim();
  if (t === "") return "";
  return /[.!?。]$/.test(t) ? t : `${t}.`;
}

/**
 * Plain sentences to speak, in reading order. Each entry is one short utterance
 * (browsers cut off very long utterances, so we never send one big string).
 * Always ends with both fixed safety lines.
 */
export function buildSpokenParts(
  plan: ResidentPlan,
  copy: ResolvedCopy,
  timelineText: string | null,
): string[] {
  const c = copy.catalog;
  const parts: string[] = [sentence(c["page.title"])];

  if (timelineText) {
    parts.push(sentence(c["card.batteryTimeline.heading"]), sentence(timelineText));
  }

  if (plan.deviceTypes.length > 0) {
    parts.push(sentence(c["card.devices.heading"]), sentence(plan.deviceTypes.join(", ")));
  }

  const contacts = plan.contacts.filter((p) => p.name.trim() || p.phone.trim());
  if (contacts.length > 0) {
    parts.push(sentence(c["card.contacts.heading"]));
    for (const p of contacts) {
      parts.push(sentence([p.name.trim(), p.phone.trim()].filter(Boolean).join(", ")));
    }
  }

  parts.push(sentence(c["card.stepsBeforeStorm.heading"]));
  for (const key of STEP_KEYS) parts.push(sentence(c[key]));

  parts.push(sentence(c["card.helpNumbers.heading"]));
  for (const h of SPOKEN_HELP) parts.push(sentence(`${c[h.key]}. ${h.detail}`));

  // Fixed safety lines, always last, verbatim.
  parts.push(copy.safetyLine1, copy.safetyLine2);

  return parts.filter((p) => p.length > 0);
}

/** The whole spoken plan as one string (for tests and previews). */
export function buildSpokenPlan(
  plan: ResidentPlan,
  copy: ResolvedCopy,
  timelineText: string | null,
): string {
  return buildSpokenParts(plan, copy, timelineText).join(" ");
}

/** The voice fields we use (a subset of SpeechSynthesisVoice). */
export interface VoiceLike {
  lang: string;
  name: string;
  default?: boolean;
}

export interface VoiceChoice<V extends VoiceLike> {
  /** The chosen voice, or null to let the browser use its default. */
  voice: V | null;
  /** The BCP-47 tag to put on the utterance. */
  lang: string;
  /** True when no voice matched the selected language and English is used. */
  fellBack: boolean;
}

function primary(tag: string): string {
  return tag.toLowerCase().replace("_", "-").split("-")[0];
}

/**
 * Pick a voice for `language`: exact tag first, then same primary language,
 * else fall back to an English voice (fellBack = true).
 */
export function pickVoice<V extends VoiceLike>(
  voices: readonly V[],
  language: SupportedLanguage,
): VoiceChoice<V> {
  const wanted = SPEECH_LANG[language];
  const norm = (t: string) => t.toLowerCase().replace("_", "-");
  const exact = voices.find((v) => norm(v.lang) === norm(wanted));
  if (exact) return { voice: exact, lang: wanted, fellBack: false };

  const want = primary(wanted);
  const sameLang = voices.filter((v) => primary(v.lang) === want);
  // For Chinese, avoid Traditional-script regional voices when possible.
  const preferred =
    language === "zh-Hans"
      ? sameLang.find((v) => !/(tw|hk|hant)/i.test(v.lang)) ?? sameLang[0]
      : sameLang[0];
  if (preferred) return { voice: preferred, lang: wanted, fellBack: false };

  if (language === "en") {
    return { voice: voices.find((v) => v.default) ?? null, lang: "en-US", fellBack: false };
  }
  const english =
    voices.find((v) => norm(v.lang) === "en-us") ?? voices.find((v) => primary(v.lang) === "en") ?? null;
  return { voice: english, lang: "en-US", fellBack: true };
}
