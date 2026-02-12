import type { Config } from "tailwindcss";
import sharedConfig from "@bitsage/config/tailwind";

export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  presets: [sharedConfig],
} satisfies Config;
