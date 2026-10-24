import type { Config } from "tailwindcss";
import caido from "@caido/tailwindcss";

export default {
  content: { relative: true, files: ["./packages/frontend/src/**/*.{vue,ts}"] },
  prefix: "hc-",
  // Caido owns the host page's reset; plugin styles must not reset it again.
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      colors: {
        canvas: "#111418",
        panel: "#161b21",
        raised: "#20262e",
        line: "#343d49",
        muted: "#9199a5",
        accent: "#4f9cf9",
      },
      screens: {
        medium: { max: "1250px" },
        narrow: { max: "980px" },
      },
    },
  },
  plugins: [caido],
} satisfies Config;
