import type { Config } from "tailwindcss";

/**
 * Neutral slate palette (Tailwind's own) with one deep-blue accent, plus the
 * three action colors. Action colors are a color-blind-safe blue / amber /
 * teal set; every use pairs them with a letter or a pattern, and the text on
 * each meets WCAG AA (white on drive 5.2:1, slate-900 on sell 8.3:1, white on
 * reduce 5.5:1).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          50: "#eef2fb",
          100: "#dbe3f6",
          200: "#b6c6ea",
          600: "#1e40af",
          700: "#1e3a8a",
          800: "#172e6e",
          900: "#0f1f4d",
        },
        action: {
          drive: "#2563eb",
          "drive-ink": "#ffffff",
          sell: "#f59e0b",
          "sell-edge": "#b45309",
          "sell-ink": "#0f172a",
          reduce: "#0f766e",
          "reduce-ink": "#ffffff",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
