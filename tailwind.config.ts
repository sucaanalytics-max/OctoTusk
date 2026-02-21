import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        tusk: {
          dark: "#1a1a2e",
          blue: "#0f3460",
          accent: "#e94560",
          light: "#f8f9fa",
        },
      },
    },
  },
  plugins: [],
};
export default config;
