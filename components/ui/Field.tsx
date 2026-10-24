// components/ui/Field.tsx
//
// Label + control + hint + error, laid out consistently. The caller renders
// the control itself (so it keeps its own id, value and aria wiring) and
// passes it as children. `inputClasses` styles text-like inputs.
//
// The error message carries role="alert" so it is announced when it appears.
// Render at most one error per page at a time (tests rely on a single alert).

import type { ReactNode } from "react";

export const inputClasses =
  "min-h-[48px] w-full rounded-md border border-neutral-400 bg-white px-3 py-2 text-lg text-storm-navy " +
  "shadow-card hover:border-storm-navy aria-[invalid=true]:border-2 aria-[invalid=true]:border-alert-red";

export const checkboxClasses = "h-6 w-6 shrink-0 accent-storm-navy";

export const labelClasses = "text-base font-semibold text-storm-navy";

export const hintClasses = "text-sm leading-relaxed text-neutral-600";

export interface FieldProps {
  /** id of the control the label points at. */
  htmlFor: string;
  label: ReactNode;
  /** Optional hint text, rendered with `hintId` so the control can reference it. */
  hint?: ReactNode;
  hintId?: string;
  /** Optional error text, rendered with role="alert" and `errorId`. */
  error?: ReactNode;
  errorId?: string;
  children: ReactNode;
  className?: string;
}

export function Field({
  htmlFor,
  label,
  hint,
  hintId,
  error,
  errorId,
  children,
  className,
}: FieldProps) {
  return (
    <div className={["flex flex-col gap-1.5", className].filter(Boolean).join(" ")}>
      <label htmlFor={htmlFor} className={labelClasses}>
        {label}
      </label>
      {children}
      {hint ? (
        <p id={hintId} className={hintClasses}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-base font-semibold text-alert-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default Field;
