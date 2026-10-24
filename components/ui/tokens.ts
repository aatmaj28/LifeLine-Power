// components/ui/tokens.ts
//
// The single source of PowerPlan's design tokens. tailwind.config.ts builds the
// Tailwind theme from these values, globals.css reads them through Tailwind's
// theme() function, and the map (MapLegend / CountyChoropleth) imports the map
// colors from here. Change a color here and every surface follows.

/** Brand palette. Text-on-color pairs are chosen for >= 4.5:1 contrast. */
export const palette = {
  navy: "#1B2A41", // primary text, header, outlines
  mist: "#EEF2F6", // page background
  surface: "#FFFFFF", // cards
  amber: "#E8A317", // single accent: battery + primary actions + focus
  amberInk: "#5A3D00", // text/icons on amber (>= 4.5:1)
  amberTint: "#FDF5E4", // soft amber surface (simulated, safety notes)
  amberEdge: "#9A6A0B", // amber border on white (>= 3:1)
  red: "#B42318", // severe alerts and errors only
  redTint: "#FDF0EE",
  green: "#2F7D4F", // safe / restoring states
  greenTint: "#EEF7F1",
} as const;

/**
 * One cool neutral scale (tuned to sit beside navy). Replaces the mixed
 * slate/gray classes. Text contrast on white: 600 = 7.2:1, 500 = 4.8:1.
 * Use 500 or darker for any text.
 */
export const neutral = {
  50: "#F7F9FB",
  100: "#EEF2F6",
  200: "#E1E7EE",
  300: "#C9D2DD",
  400: "#94A3B5",
  500: "#5E6E82",
  600: "#46566B",
  700: "#334155",
  800: "#243246",
  900: "#1B2A41",
} as const;

/** Map colors, shared by the legend swatches and the Leaflet layers. */
export const mapColors = {
  /** ZIP circle fill per outreach-priority bucket. */
  bucket: {
    lower: "#D3DAE4",
    medium: "#8C9CB3",
    higher: "#4A5D7C",
    highest: palette.amber,
  },
  /** County fill ramp (light to dark) for power-dependent totals. */
  county: ["#F1F5F9", "#E2E8F0", "#CBD5E1", "#94A3B8", "#64748B"],
} as const;

export const radius = {
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "20px",
} as const;

/** Soft, navy-tinted shadows. Depth, not decoration. */
export const shadow = {
  card: "0 1px 2px rgba(27, 42, 65, 0.06), 0 1px 3px rgba(27, 42, 65, 0.08)",
  raised: "0 2px 4px rgba(27, 42, 65, 0.06), 0 6px 16px rgba(27, 42, 65, 0.10)",
  overlay: "0 8px 24px rgba(27, 42, 65, 0.16), 0 2px 6px rgba(27, 42, 65, 0.08)",
} as const;
