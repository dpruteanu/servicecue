import type { Config } from "tailwindcss";

export default {
  content: ["./src/renderer/**/*.{html,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cue: {
          ink: "#18212f",
          muted: "#647083",
          line: "#d8dee8",
          panel: "#f6f8fb",
          action: "#245bdb",
          actionDark: "#173f9c",
          warm: "#b45309",
          ok: "#0f766e",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
