import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#fafaff",
          100: "#f4f3fb",
          200: "#e7e6f3",
          300: "#cfcce0",
          400: "#9d99b8",
          500: "#6c6890",
          600: "#46436a",
          700: "#2d2b4c",
          800: "#1b1a33",
          900: "#0f0e22",
        },
        approve: {
          50: "#f4f1fe",
          100: "#ebe5fe",
          200: "#d6cafd",
          300: "#b9a5fb",
          400: "#9577f7",
          500: "#7553f1",
          600: "#5b3cea",
          700: "#4f3deb",
          800: "#3f2cc4",
          900: "#33269c",
        },
        si: {
          50: "#fff5ef",
          100: "#ffe4d3",
          200: "#fdc6a1",
          300: "#f9a06a",
          400: "#ee7f43",
          500: "#e07555",
          600: "#c25a3c",
          700: "#9c4630",
        },
        amber: {
          DEFAULT: "#f5b800",
        },
        coal: {
          900: "#0c0c12",
          800: "#13131c",
          700: "#1c1c28",
          600: "#262636",
          500: "#3a3a4e",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(31,28,72,.04), 0 8px 24px -8px rgba(31,28,72,.10)",
        lift: "0 1px 0 rgba(31,28,72,.04), 0 24px 48px -20px rgba(91,60,234,.25)",
        ringPurple: "0 0 0 1px rgba(91,60,234,.20), 0 12px 30px -10px rgba(91,60,234,.35)",
        ringCoral: "0 0 0 1px rgba(224,117,85,.30), 0 12px 30px -10px rgba(224,117,85,.45)",
      },
    },
  },
  plugins: [],
};

export default config;
