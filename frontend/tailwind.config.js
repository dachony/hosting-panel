/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'var(--color-primary-50, #f4f6fa)',
          100: 'var(--color-primary-100, #e8ecf4)',
          200: 'var(--color-primary-200, #cdd5e5)',
          300: 'var(--color-primary-300, #a8b6d0)',
          400: 'var(--color-primary-400, #7e93b8)',
          500: 'var(--color-primary-500, #5f78a0)',
          600: 'var(--color-primary-600, #4c6288)',
          700: 'var(--color-primary-700, #3f5070)',
          800: 'var(--color-primary-800, #354259)',
          900: 'var(--color-primary-900, #2c3648)',
          950: 'var(--color-primary-950, #1d2430)',
        },
      },
    },
  },
  plugins: [],
}
