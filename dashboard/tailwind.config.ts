import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ok: { DEFAULT: '#16a34a' },
        warn: { DEFAULT: '#ca8a04' },
        crit: { DEFAULT: '#dc2626' },
      },
    },
  },
  plugins: [],
} satisfies Config;
