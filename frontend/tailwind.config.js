/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#07080e",     // Deep cosmic dark space
          panel: "#0d0f17",       // Dark glass base
          elevated: "#131622",    // Lighter glass card
          hover: "#1e2235",       // Interactive hover highlights
        },
        border: {
          DEFAULT: "rgba(255, 255, 255, 0.08)", // Sleek transparent white dividers
          muted: "rgba(255, 255, 255, 0.04)",   // Very faint dividers
        },
        accent: {
          DEFAULT: "#6366f1",     // Neon Indigo/Violet primary
          hover: "#818cf8",       // Bright hover state
          muted: "#4f46e5",       // Deep background accent
        },
        success: "#10b981",       // Vibrant emerald
        warning: "#f59e0b",       // Warm amber
        danger: "#ef4444",        // Rose red
        txt: {
          DEFAULT: "#f3f4f6",     // Clean off-white
          muted: "#9ca3af",       // Sleek mid-tone gray
          faint: "#6b7280",       // Dimmed context gray
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "monospace"],
      },
      boxShadow: {
        panel: "0 12px 40px -10px rgba(0, 0, 0, 0.75)",
        popover: "0 10px 30px -5px rgba(0, 0, 0, 0.8)",
        glow: "0 0 20px rgba(99, 102, 241, 0.15)", // Soft purple button glow
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(1rem)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(0.5rem)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "scale-in": "scale-in 0.15s ease-out",
        "slide-in-right": "slide-in-right 0.2s ease-out",
        "slide-up": "slide-up 0.18s ease-out",
      },
    },
  },
  plugins: [],
};
