"use client";

// components/ReadAloud.tsx
//
// "Read my plan aloud" and "Stop" for the Outage Plan card, using the browser's
// own speechSynthesis voices. No external API is called.
//
// - The voice matches the selected language when the device has one.
// - If it does not, we say so plainly and read the English plan instead (so the
//   words and the voice match).
// - If the browser has no speechSynthesis at all, the buttons are replaced by a
//   short note.

import { useCallback, useEffect, useRef, useState } from "react";

import type { ResolvedCopy } from "@/lib/app/copy/resolve";
import type { ResidentPlan } from "@/lib/app/plan-storage";
import { buildSpokenParts, LANGUAGE_NAME, pickVoice } from "@/lib/app/speech";

export interface ReadAloudProps {
  plan: ResidentPlan;
  /** Copy in the selected language. */
  copy: ResolvedCopy;
  /** English copy, used when no voice exists for the selected language. */
  englishCopy: ResolvedCopy;
  /** Battery sentence in the selected language (or null). */
  timelineText: string | null;
  /** Battery sentence in English (or null). */
  englishTimelineText: string | null;
  className?: string;
}

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function"
    ? window.speechSynthesis
    : null;
}

/** Voices load asynchronously in some browsers; wait briefly for them. */
function loadVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const now = synth.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      synth.removeEventListener?.("voiceschanged", finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener?.("voiceschanged", finish);
    setTimeout(finish, 1000);
  });
}

export function ReadAloud({
  plan,
  copy,
  englishCopy,
  timelineText,
  englishTimelineText,
  className,
}: ReadAloudProps) {
  const [supported, setSupported] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [note, setNote] = useState("");
  const runId = useRef(0);

  useEffect(() => {
    setSupported(getSynth() !== null);
    return () => {
      getSynth()?.cancel();
    };
  }, []);

  // A language change mid-speech would mix languages; stop instead.
  useEffect(() => {
    getSynth()?.cancel();
    setSpeaking(false);
    setNote("");
  }, [plan.language]);

  const read = useCallback(async () => {
    const synth = getSynth();
    if (!synth) {
      setSupported(false);
      return;
    }
    synth.cancel();
    const id = ++runId.current;

    const voices = await loadVoices(synth);
    if (id !== runId.current) return;
    const choice = pickVoice(voices, plan.language);

    const parts = choice.fellBack
      ? buildSpokenParts(plan, englishCopy, englishTimelineText)
      : buildSpokenParts(plan, copy, timelineText);

    setNote(
      choice.fellBack
        ? `No ${LANGUAGE_NAME[plan.language]} voice is available on this device, so your plan will be read in English.`
        : "",
    );

    parts.forEach((text, index) => {
      const u = new window.SpeechSynthesisUtterance(text);
      u.lang = choice.lang;
      if (choice.voice) u.voice = choice.voice;
      u.rate = 0.9; // a little slower for clarity
      if (index === parts.length - 1) {
        u.onend = () => {
          if (id === runId.current) setSpeaking(false);
        };
      }
      u.onerror = () => {
        if (id === runId.current) setSpeaking(false);
      };
      synth.speak(u);
    });
    setSpeaking(true);
  }, [plan, copy, englishCopy, timelineText, englishTimelineText]);

  const stop = useCallback(() => {
    runId.current += 1;
    getSynth()?.cancel();
    setSpeaking(false);
  }, []);

  if (!supported) {
    return (
      <p className={["text-base text-storm-navy", className ?? ""].join(" ").trim()}>
        Read aloud is not available in this browser.
      </p>
    );
  }

  return (
    <div className={["flex flex-col gap-2", className ?? ""].join(" ").trim()}>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={read}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md border-2 border-storm-navy bg-white px-5 py-2 text-base font-semibold text-storm-navy hover:bg-mist"
        >
          <span aria-hidden="true">🔊</span> Read my plan aloud
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={!speaking}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-slate-400 bg-white px-5 py-2 text-base font-medium text-storm-navy hover:bg-mist disabled:cursor-not-allowed disabled:text-slate-400"
        >
          <span aria-hidden="true">■</span> Stop
        </button>
      </div>
      <p role="status" className="text-sm text-slate-700">
        {note || (speaking ? "Reading your plan aloud." : "")}
      </p>
    </div>
  );
}

export default ReadAloud;
