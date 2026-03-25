import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0f0f1a",
        surface: "#1a1a2e",
        border: "#2a2a4a",
        primary: "#6c5ce7",
        "primary-foreground": "#ffffff",
        muted: "#888888",
        foreground: "#e0e0e0",
        success: "#00b894",
        "assistant-bg": "#1e1e3a",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
