---
inclusion: always
---

# PowerPlan — Accessibility

Target: **WCAG 2.2 AA**. These rules apply to every page and component.

- Color contrast at least **4.5:1** for text (3:1 for large text and UI
  components). Never convey meaning by color alone; pair color with text or an
  icon.
- **Visible focus** indicators on every interactive element; never remove focus
  outlines without an equal or better replacement.
- **Accessible names** on all controls (buttons, links, inputs, map controls).
  Inputs have associated `<label>`s. Icon-only buttons have `aria-label`.
- Minimum **44x44px tap targets** for touch controls.
- Fully **keyboard operable**: logical tab order, no keyboard traps, Enter/Space
  activate controls, visible skip-to-content link.
- **Screen reader friendly**: semantic HTML (headings in order, landmarks,
  lists, tables with headers). Use ARIA only to fill gaps, not to replace
  semantics. Live regions announce dynamic updates (e.g. new alerts).
- **Large, readable text** for older users: base body text >= 16px, generous
  line height, resizable without breaking layout.
- **Respect reduced motion**: honor `prefers-reduced-motion`; no essential
  information conveyed only through animation.
- The map must have a non-map alternative (the ranked list) so map interaction
  is never the only path to the data.

Note: automated axe checks catch many issues but not all. Full WCAG conformance
requires manual testing with assistive technologies and expert review.
