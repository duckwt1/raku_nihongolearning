/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        raku: {
          canvas: 'rgb(var(--raku-canvas) / <alpha-value>)',
          surface: 'rgb(var(--raku-surface) / <alpha-value>)',
          subtle: 'rgb(var(--raku-subtle) / <alpha-value>)',
          ink: 'rgb(var(--raku-ink) / <alpha-value>)',
          muted: 'rgb(var(--raku-muted) / <alpha-value>)',
          accent: 'rgb(var(--raku-accent) / <alpha-value>)',
          'accent-soft': 'rgb(var(--raku-accent-soft) / <alpha-value>)',
          signal: 'rgb(var(--raku-signal) / <alpha-value>)',
          line: 'rgb(var(--raku-line) / <alpha-value>)',
          'on-accent': 'rgb(var(--raku-on-accent) / <alpha-value>)'
        },
        slate: {
          50: 'rgb(var(--raku-neutral-50) / <alpha-value>)',
          100: 'rgb(var(--raku-neutral-100) / <alpha-value>)',
          200: 'rgb(var(--raku-neutral-200) / <alpha-value>)',
          300: 'rgb(var(--raku-neutral-300) / <alpha-value>)',
          400: 'rgb(var(--raku-neutral-400) / <alpha-value>)',
          500: 'rgb(var(--raku-neutral-500) / <alpha-value>)',
          600: 'rgb(var(--raku-neutral-600) / <alpha-value>)',
          700: 'rgb(var(--raku-neutral-700) / <alpha-value>)',
          800: 'rgb(var(--raku-neutral-800) / <alpha-value>)',
          900: 'rgb(var(--raku-neutral-900) / <alpha-value>)',
          950: 'rgb(var(--raku-neutral-950) / <alpha-value>)'
        },
        sky: {
          50: '#EFF8F6',
          100: '#DDEFEA',
          200: '#B8DED6',
          300: '#8FC8BB',
          400: '#61B5A8',
          500: '#188F81',
          600: '#006D67',
          700: '#005852',
          800: '#174A46',
          900: '#123B38',
          950: '#0D2B29'
        }
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"Noto Sans JP"', 'sans-serif']
      },
      minHeight: {
        touch: '44px'
      },
      minWidth: {
        touch: '44px'
      }
    }
  },
  plugins: []
};
