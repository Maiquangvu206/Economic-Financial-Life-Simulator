/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#020617',
          900: '#0f172a',
          850: '#1e293b',
          800: '#334155',
        },
        efls: {
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#ef4444',
          indigo: '#6366f1',
          slate: '#64748b',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        heading: ['"Outfit"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'game-glow': '0 0 20px rgba(16, 185, 129, 0.15)',
        'game-glow-amber': '0 0 20px rgba(245, 158, 11, 0.15)',
        'game-glow-rose': '0 0 20px rgba(239, 68, 68, 0.15)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'coin-fall': 'coin-fall 0.6s ease-out forwards',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 10px rgba(16, 185, 129, 0.2)' },
          '50%': { boxShadow: '0 0 25px rgba(16, 185, 129, 0.5)' },
        },
        'coin-fall': {
          '0%': { transform: 'translateY(-20px) scale(1)', opacity: '1' },
          '100%': { transform: 'translateY(0) scale(0.9)', opacity: '0.8' },
        },
      },
    },
  },
  plugins: [],
};
