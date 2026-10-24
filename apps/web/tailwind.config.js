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
          50: '#F2F5ED',
          100: '#E6EDDE',
          200: '#CADCC5',
          300: '#ABC7A8',
          400: '#83A989',
          500: '#527F6A',
          600: '#28665B',
          700: '#205349',
          800: '#194238',
          900: '#15352F',
          950: '#102722'
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
