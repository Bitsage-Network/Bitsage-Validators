import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    screens: {
      'xs': '475px',
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        // Primary CTA — emerald
        primary: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
          950: "#022c22",
        },
        // Validator — amber
        validator: {
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
          950: "#451a03",
        },
        // Obelysk — violet
        obelysk: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
          950: "#2e1065",
        },
        // Marketplace — blue
        marketplace: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
          950: "#172554",
        },
        // GPU generation colors
        gpu: {
          blackwell: "#84cc16",  // lime
          hopper: "#10b981",     // emerald
          ampere: "#3b82f6",     // blue
          ada: "#8b5cf6",        // violet
          turing: "#f59e0b",     // amber
          legacy: "#6b7280",     // gray
        },
        // Backward compat — brand → emerald alias
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
          950: "#022c22",
        },
        // Accent colors
        accent: {
          cyan: "#22d3ee",
          purple: "#a855f7",
          emerald: "#10b981",
          orange: "#f97316",
        },
        // Background / surface colors
        surface: {
          dark: "#0a0a0f",
          card: "#111118",
          elevated: "#1a1a24",
          border: "#2a2a3a",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "glass-gradient": "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "glow": "glow 2s ease-in-out infinite alternate",
        "float": "float 6s ease-in-out infinite",
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 20px rgba(16, 185, 129, 0.3)" },
          "100%": { boxShadow: "0 0 40px rgba(16, 185, 129, 0.6)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      boxShadow: {
        "glow-sm": "0 0 10px rgba(16, 185, 129, 0.3)",
        "glow-md": "0 0 20px rgba(16, 185, 129, 0.4)",
        "glow-lg": "0 0 40px rgba(16, 185, 129, 0.5)",
        "glow-emerald": "0 0 20px rgba(16, 185, 129, 0.4)",
        "glow-violet": "0 0 20px rgba(139, 92, 246, 0.4)",
        "glow-amber": "0 0 20px rgba(245, 158, 11, 0.4)",
      },
    },
  },
  plugins: [],
} satisfies Config;
