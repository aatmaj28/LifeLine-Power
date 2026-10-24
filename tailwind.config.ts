import type { Config } from "tailwindcss";

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
        storm: {
          navy: "#1B2A41",
        },
        mist: "#EEF2F6",
        power: {
          amber: "#E8A317",
          // Dark brown ink that reads on amber at >= 4.5:1, for text/icons
          // placed on an amber fill.
          ink: "#5A3D00",
        },
        alert: {
          red: "#B42318",
        },
        calm: {
          green: "#2F7D4F",
        },
      },
    },
  },
  plugins: [],
};

export default config;
