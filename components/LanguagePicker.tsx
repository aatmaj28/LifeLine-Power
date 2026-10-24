"use client";

import type { SupportedLanguage } from "@/lib/app/translate/providers";

/**
 * LanguagePicker lets the resident choose one of the six supported languages
 * for their Outage Plan card.
 *
 * It is a controlled client component: the caller owns the selected
 * {@link SupportedLanguage} and is notified through `onChange` so it can
 * re-request translated copy (`/api/translate`) and re-render the card.
 */
export interface LanguagePickerProps {
  /** The currently selected language. */
  value: SupportedLanguage;
  /** Called with the newly selected language when the resident changes it. */
  onChange: (lang: SupportedLanguage) => void;
  /**
   * Visible label text. Defaults to English "Language" but may be passed in a
   * resident's own language so the control is localized by the caller.
   */
  label?: string;
  /** DOM id tying the `<label>` to the `<select>`; defaults to "language-picker". */
  id?: string;
  /** Optional extra classes for the container. */
  className?: string;
}

/**
 * The six supported languages, each labeled with its own autonym (the name of
 * the language in that language) for immediate recognizability by native
 * speakers. The `value` is the engine/storage {@link SupportedLanguage} code.
 */
const LANGUAGE_OPTIONS: ReadonlyArray<{
  value: SupportedLanguage;
  label: string;
}> = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
  { value: "ht", label: "Kreyòl Ayisyen" },
  { value: "zh-Hans", label: "简体中文" },
  { value: "vi", label: "Tiếng Việt" },
];

/**
 * Renders a visible `<label>` associated with a native `<select>` so the
 * control always has an accessible name.
 *
 * Accessibility (WCAG 2.2 AA): the label is visible (not just a placeholder)
 * and tied to the select via `htmlFor`/`id`; generous padding keeps the tap
 * target at least 44x44px; the default focus ring is preserved for a visible
 * focus indicator. Autonym option labels avoid conveying meaning by anything
 * other than readable text.
 */
export function LanguagePicker({
  value,
  onChange,
  label = "Language",
  id = "language-picker",
  className,
}: LanguagePickerProps) {
  const containerClasses = ["flex flex-col gap-1", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={containerClasses}>
      <label htmlFor={id} className="text-base font-semibold text-storm-navy">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) =>
          onChange(event.target.value as SupportedLanguage)
        }
        className="min-h-[48px] rounded-md border border-neutral-400 bg-white px-3 py-2 text-base text-storm-navy shadow-card hover:border-storm-navy"
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default LanguagePicker;
