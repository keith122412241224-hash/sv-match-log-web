import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: "#f7f8fb",
        ink: "#1d2433",
        muted: "#687084"
      }
    }
  },
  plugins: []
};

export default config;
