import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f1115",
        paper: "#fafafa",
        brand: {
          50: "#eef4ff",
          100: "#dbe7ff",
          200: "#b8cfff",
          300: "#8fb0ff",
          400: "#5f88ff",
          500: "#3b63f2",
          600: "#2c4bd6",
          700: "#243cad",
          800: "#20338a",
          900: "#1e2f6f",
        },
        ig: "#d6336c",
        tiktok: "#0f1115",
        x: "#111111",
        threads: "#3b3b3b",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,17,21,0.04), 0 8px 24px -12px rgba(15,17,21,0.12)",
      },
      borderRadius: {
        xl2: "1.1rem",
      },
    },
  },
  plugins: [],
};

export default config;
