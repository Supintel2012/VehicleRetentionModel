import type { Config } from "tailwindcss";

/**
 * Supported Intelligence's palette and type (new-si-site tailwind.config.ts
 * and client/src/index.css): slate text and borders, the burnt-sienna primary
 * (#EE6C4D), the light-blue secondary (#98C1D9) and the dark-blue accent
 * (#3D5A80), set in Plus Jakarta Sans with 0.75rem corners and soft card
 * shadows. The deeper primary steps (600, 700) are this page's addition so
 * that white text on a sienna control reads at WCAG AA; the site's own
 * primary is used wherever the text sits beside the colour, not on it.
 *
 * The three action colours are a colour-blind-safe blue / amber / teal set
 * from the first build; every use pairs them with a letter or a pattern, and
 * the text on each meets WCAG AA (white on drive 5.2:1, slate-900 on sell
 * 8.3:1, white on reduce 5.5:1).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#fdf2ee",
          100: "#fbe1d9",
          200: "#f7c3b4",
          500: "#ee6c4d",
          600: "#d9553a",
          700: "#c24a30",
        },
        secondary: {
          100: "#e8f0f6",
          200: "#cbdde9",
          500: "#98c1d9",
          700: "#5f8fb1",
        },
        accent: {
          50: "#eef3f8",
          100: "#dbe5ef",
          200: "#b8cadf",
          600: "#3d5a80",
          700: "#34506f",
          800: "#2b4360",
          900: "#22364d",
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
        sans: ["var(--font-jakarta)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      borderRadius: {
        lg: "1rem",
        md: "0.75rem",
        sm: "0.5rem",
      },
      boxShadow: {
        soft: "0 2px 15px rgba(0, 0, 0, 0.06)",
        card: "0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)",
        hover: "0 4px 20px rgba(0, 0, 0, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
