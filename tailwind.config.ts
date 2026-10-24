import type { Config } from "tailwindcss";
import { mapColors, neutral, palette, radius, shadow } from "./components/ui/tokens";

// Every color, radius and shadow comes from components/ui/tokens.ts, so the
// palette is defined exactly once.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // `font-sans` resolves to Atkinson Hyperlegible (wired in layout.tsx).
        sans: [
          "var(--font-atkinson)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        storm: { navy: palette.navy },
        mist: palette.mist,
        surface: palette.surface,
        power: {
          amber: palette.amber,
          // Dark brown ink that reads on amber at >= 4.5:1.
          ink: palette.amberInk,
          tint: palette.amberTint,
          edge: palette.amberEdge,
        },
        alert: { red: palette.red, tint: palette.redTint },
        calm: { green: palette.green, tint: palette.greenTint },
        neutral,
        map: {
          lower: mapColors.bucket.lower,
          medium: mapColors.bucket.medium,
          higher: mapColors.bucket.higher,
          highest: mapColors.bucket.highest,
        },
      },
      borderRadius: radius,
      boxShadow: shadow,
    },
  },
  plugins: [],
};

export default config;
