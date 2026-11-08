import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /** Bảng màu sáng pastel: surface-900 = nền thẻ, surface-950 = nền trang. */
        surface: {
          50: '#f6f8fc',
          100: '#eef2f9',
          200: '#e2e9f4',
          800: '#d5dfef',
          850: '#e9eff9',
          900: '#ffffff',
          950: '#f6f8fc',
        },
        accent: {
          DEFAULT: '#10b981',
          muted: '#a7f3d0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'game-glow': '0 18px 40px -24px rgba(16, 185, 129, 0.45)',
        soft: '0 12px 32px -18px rgba(71, 85, 105, 0.35)',
      },
    },
  },
  plugins: [],
} satisfies Config;
