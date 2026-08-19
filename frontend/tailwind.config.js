/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // "Salon System" palette — deep botanical green + warm terracotta
        // + antique-gold accents on a hand-finished ivory surface, built to
        // read as a boutique spa brand rather than a generic dashboard
        // template.
        ink: {
          950: "#0E1512",
          900: "#152019",
          800: "#1E2C23",
          700: "#2A3D30",
        },
        brass: {
          400: "#D6B370",
          500: "#C79A4B",
          600: "#A97F35",
          700: "#8A6529",
        },
        terracotta: {
          50: "#FBF0EC",
          400: "#C97A5C",
          500: "#B5603F",
          600: "#98492E",
          700: "#7A3A24",
        },
        sage: {
          50: "#F4F7F2",
          100: "#E6EDE2",
          200: "#CBDAC2",
        },
        cream: {
          50: "#FCF9F3",
          100: "#F6F0E4",
          200: "#ECE1CC",
        },
        status: {
          available: "#2F9E6B",
          busy: "#C1543F",
          pending: "#C98A2C",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(30, 22, 12, 0.04), 0 10px 28px -14px rgba(30, 22, 12, 0.22)",
        lift: "0 2px 6px rgba(30, 22, 12, 0.06), 0 20px 40px -18px rgba(30, 22, 12, 0.28)",
      },
      backgroundImage: {
        "grain": "radial-gradient(circle at 1px 1px, rgba(30,22,12,0.05) 1px, transparent 0)",
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        body: ["'Manrope'", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
