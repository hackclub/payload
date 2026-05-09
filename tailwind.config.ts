import type { Config } from "tailwindcss";
import flyonui from "flyonui";

export default {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./node_modules/flyonui/dist/js/*.js",
  ],
  theme: {
    extend: {
      colors: {
        hc: {
          red: "#ec3750",
          orange: "#ff8c37",
          yellow: "#f1c40f",
          green: "#33d6a6",
          cyan: "#5bc0de",
          blue: "#338eda",
          purple: "#a633d6",
          darker: "#121217",
          dark: "#17171d",
          darkless: "#252429",
          black: "#1f2d3d",
          steel: "#273444",
          slate: "#3c4858",
          muted: "#8492a6",
          smoke: "#e0e6ed",
          snow: "#f9fafc",
        },
      },
      borderRadius: {
        hc: "8px",
      },
    },
  },
  plugins: [
    flyonui({
      themes: ["light", "dark"]
    })
  ],
} satisfies Config;
