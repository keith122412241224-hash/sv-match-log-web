import type { Config } from "tailwindcss";

// Property-specific aliases preserve existing light utility classes and white button labels.
const config: Config = {
  "content": [
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  "theme": {
    "extend": {
      "colors": {
        "surface": "rgb(var(--surface) / <alpha-value>)",
        "ink": "rgb(var(--ink) / <alpha-value>)",
        "muted": "rgb(var(--muted) / <alpha-value>)"
      },
      "backgroundColor": {
        "white": "rgb(var(--panel) / <alpha-value>)",
        "ink": "rgb(var(--primary) / <alpha-value>)",
        "slate": {
          "50": "rgb(var(--subtle) / <alpha-value>)",
          "100": "rgb(var(--hover) / <alpha-value>)",
          "200": "rgb(var(--track) / <alpha-value>)",
          "700": "rgb(var(--primary-hover) / <alpha-value>)",
          "800": "rgb(var(--primary-strong) / <alpha-value>)"
        },
        "sky": {
          "50": "rgb(var(--sky-50) / <alpha-value>)",
          "100": "rgb(var(--sky-100) / <alpha-value>)"
        },
        "amber": {
          "50": "rgb(var(--amber-50) / <alpha-value>)",
          "100": "rgb(var(--amber-100) / <alpha-value>)"
        },
        "emerald": {
          "50": "rgb(var(--emerald-50) / <alpha-value>)",
          "100": "rgb(var(--emerald-100) / <alpha-value>)"
        },
        "red": {
          "50": "rgb(var(--red-50) / <alpha-value>)"
        },
        "rose": {
          "50": "rgb(var(--rose-50) / <alpha-value>)",
          "100": "rgb(var(--rose-100) / <alpha-value>)"
        }
      },
      "textColor": {
        "slate": {
          "300": "#cbd5e1",
          "400": "rgb(var(--text-faint) / <alpha-value>)",
          "600": "rgb(var(--text-secondary) / <alpha-value>)",
          "900": "rgb(var(--text-slate) / <alpha-value>)"
        },
        "amber": {
          "800": "rgb(var(--text-amber-800) / <alpha-value>)",
          "900": "rgb(var(--text-amber-900) / <alpha-value>)",
          "950": "rgb(var(--text-amber-950) / <alpha-value>)"
        },
        "emerald": {
          "700": "rgb(var(--text-emerald-700) / <alpha-value>)",
          "800": "rgb(var(--text-emerald-800) / <alpha-value>)",
          "900": "rgb(var(--text-emerald-900) / <alpha-value>)",
          "950": "rgb(var(--text-emerald-950) / <alpha-value>)"
        },
        "red": {
          "700": "rgb(var(--text-red-700) / <alpha-value>)",
          "800": "rgb(var(--text-red-800) / <alpha-value>)",
          "900": "rgb(var(--text-red-900) / <alpha-value>)"
        },
        "rose": {
          "700": "rgb(var(--text-rose-700) / <alpha-value>)"
        },
        "sky": {
          "800": "rgb(var(--text-sky-800) / <alpha-value>)",
          "900": "rgb(var(--text-sky-900) / <alpha-value>)",
          "950": "rgb(var(--text-sky-950) / <alpha-value>)"
        },
        "blue": {
          "800": "rgb(var(--text-blue-800) / <alpha-value>)"
        }
      },
      "borderColor": {
        "ink": "rgb(var(--ink) / <alpha-value>)",
        "slate": {
          "100": "rgb(var(--border-soft) / <alpha-value>)",
          "200": "rgb(var(--border) / <alpha-value>)",
          "300": "rgb(var(--border-input) / <alpha-value>)",
          "400": "rgb(var(--border-strong) / <alpha-value>)",
          "500": "rgb(var(--chart-marker) / <alpha-value>)",
          "700": "rgb(var(--text-secondary) / <alpha-value>)"
        },
        "amber": {
          "200": "rgb(var(--border-amber-200) / <alpha-value>)",
          "300": "rgb(var(--border-amber-300) / <alpha-value>)"
        },
        "emerald": {
          "200": "rgb(var(--border-emerald-200) / <alpha-value>)",
          "300": "rgb(var(--border-emerald-300) / <alpha-value>)",
          "700": "rgb(var(--border-emerald-700) / <alpha-value>)"
        },
        "red": {
          "200": "rgb(var(--border-red-200) / <alpha-value>)",
          "300": "rgb(var(--border-red-300) / <alpha-value>)",
          "500": "rgb(var(--border-red-500) / <alpha-value>)",
          "700": "rgb(var(--border-red-700) / <alpha-value>)"
        },
        "rose": {
          "200": "rgb(var(--border-rose-200) / <alpha-value>)"
        },
        "sky": {
          "700": "rgb(var(--border-sky-700) / <alpha-value>)"
        }
      },
      "divideColor": {
        "slate": {
          "200": "rgb(var(--border) / <alpha-value>)"
        }
      },
      "ringColor": {
        "blue": {
          "600": "rgb(var(--focus) / <alpha-value>)"
        },
        "slate": {
          "200": "rgb(var(--border) / <alpha-value>)",
          "300": "rgb(var(--border-input) / <alpha-value>)"
        }
      },
      "outlineColor": {
        "sky": {
          "700": "rgb(var(--focus-sky) / <alpha-value>)"
        },
        "emerald": {
          "700": "rgb(var(--focus-success) / <alpha-value>)"
        },
        "slate": {
          "700": "rgb(var(--text-secondary) / <alpha-value>)"
        }
      }
    }
  },
  "plugins": []
};

export default config;
