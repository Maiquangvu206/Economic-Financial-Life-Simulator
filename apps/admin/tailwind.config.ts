import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /** Bảng màu sáng pastel dùng chung cho bảng điều khiển quản trị. */
        surface: {
          50: '#f8f7fc',
          100: '#f1effa',
          200: '#e6e3f4',
          800: '#dcd8ee',
          850: '#eeecf9',
          900: '#ffffff',
          950: '#f8f7fc',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 12px 32px -18px rgba(71, 85, 105, 0.35)',
      },
    },
  },
  plugins: [],
} satisfies Config;
