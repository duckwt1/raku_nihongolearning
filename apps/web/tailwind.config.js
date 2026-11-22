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
          body: 'rgb(var(--raku-body) / <alpha-value>)',
          muted: 'rgb(var(--raku-muted) / <alpha-value>)',
          line: 'rgb(var(--raku-line) / <alpha-value>)',
          'line-strong': 'rgb(var(--raku-line-strong) / <alpha-value>)',
          accent: 'rgb(var(--raku-accent) / <alpha-value>)',
          'accent-hover': 'rgb(var(--raku-accent-hover) / <alpha-value>)',
          'accent-soft': 'rgb(var(--raku-accent-soft) / <alpha-value>)',
          'on-accent': 'rgb(var(--raku-on-accent) / <alpha-value>)',
          signal: 'rgb(var(--raku-signal) / <alpha-value>)',
          'signal-soft': 'rgb(var(--raku-signal-soft) / <alpha-value>)',
          again: 'rgb(var(--raku-again) / <alpha-value>)',
          'again-soft': 'rgb(var(--raku-again-soft) / <alpha-value>)',
          hard: 'rgb(var(--raku-hard) / <alpha-value>)',
          'hard-soft': 'rgb(var(--raku-hard-soft) / <alpha-value>)',
          good: 'rgb(var(--raku-good) / <alpha-value>)',
          'good-soft': 'rgb(var(--raku-good-soft) / <alpha-value>)',
          easy: 'rgb(var(--raku-easy) / <alpha-value>)',
          'easy-soft': 'rgb(var(--raku-easy-soft) / <alpha-value>)'
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
          50: '#EEF4F0',
          100: '#E2ECE5',
          200: '#C4DACB',
          300: '#9CC2AA',
          400: '#6FA388',
          500: '#42806A',
          600: '#245C52',
          700: '#1C4B42',
          800: '#173C35',
          900: '#13302B',
          950: '#0E2320'
        }
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        jp: ['"Zen Kaku Gothic New"', '"Noto Sans JP"', 'sans-serif']
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
