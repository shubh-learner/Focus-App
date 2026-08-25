/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#f7f5f2",
        card: "#fbfaf8",
        ink: "#2b2a28",
        muted: "#7a766f",
        line: "#e6e2da",
        accent: "#8a7b5c",
      },
      fontFamily: {
        serif: ["Georgia", "Iowan Old Style", "Palatino Linotype", "serif"],
        sans: ["-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(43, 42, 40, 0.06)",
      },
    },
  },
  plugins: [],
};
