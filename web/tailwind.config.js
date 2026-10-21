/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: '#F5F4EF',
        card: '#FFFFFF',
        line: '#E2E0D8',
        ink: '#15201B',
        muted: '#5B655F',
        primary: { DEFAULT: '#1F6F57', light: '#8CC7B0', dark: '#17543F' },
        amber: { DEFAULT: '#E39B2E', soft: '#FBEBD3' },
        warn: '#A33A12',
        side: '#15201B',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '12px' },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
    },
  },
  plugins: [],
}
