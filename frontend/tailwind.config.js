/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#1d4ed8",
        accent: "#3b82f6"
      }
    }
  },
  plugins: []
};
