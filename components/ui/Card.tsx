// components/ui/Card.tsx
//
// White surface, rounded-xl, subtle shadow, consistent padding. Renders a
// <div> by default; pass `as="section"` (with aria-labelledby) or
// `as="article"` when the card is a landmark or self-contained item.

import type { HTMLAttributes } from "react";

export type CardPadding = "sm" | "md" | "lg";

const PADDING: Record<CardPadding, string> = {
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

export function cardClasses({
  padding = "md",
  className,
}: { padding?: CardPadding; className?: string } = {}): string {
  return [
    "rounded-xl border border-neutral-200 bg-white text-storm-navy shadow-card",
    PADDING[padding],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article" | "aside";
  padding?: CardPadding;
}

export function Card({ as: Tag = "div", padding = "md", className, ...rest }: CardProps) {
  return <Tag className={cardClasses({ padding, className })} {...rest} />;
}

export default Card;
