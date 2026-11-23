/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        'foldable': {'raw': '(min-width: 680px) and (min-aspect-ratio: 4/5)'},
      },
      colors: {
        malaysia: {
          blue: '#002B7F',
          red: '#ED2128',
          yellow: '#FFDF00',
          white: '#FFFFFF',
        }
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 150ms ease-out',
      },
    },
  },
  plugins: [],
}

