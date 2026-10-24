// components/ui/Button.tsx
//
// One button style system. `buttonClasses` is exported so links (next/link)
// can look like buttons without becoming buttons. Focus styling comes from the
// global :focus-visible rule in globals.css; never add outline-none here.

import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "lg";

const BASE =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md font-semibold " +
  "transition-colors motion-reduce:transition-none " +
  "disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:shadow-none";

const VARIANTS: Record<ButtonVariant, string> = {
  // Amber fill with dark ink text (>= 4.5:1).
  primary:
    "border border-power-edge bg-power-amber text-power-ink shadow-card hover:bg-[#D9960F]",
  // Navy outline on white.
  secondary:
    "border-2 border-storm-navy bg-white text-storm-navy shadow-card hover:bg-mist",
  // Quiet action, still a clear 48px target with an underline cue.
  ghost:
    "border border-transparent bg-transparent text-storm-navy underline-offset-4 hover:bg-neutral-100 hover:underline",
};

const SIZES: Record<ButtonSize, string> = {
  md: "px-5 py-2 text-base",
  lg: "px-6 py-3 text-lg",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return [BASE, VARIANTS[variant], SIZES[size], className].filter(Boolean).join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return <button type={type} className={buttonClasses({ variant, size, className })} {...rest} />;
}

export default Button;
