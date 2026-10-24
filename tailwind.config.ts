import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1.25rem', md: '2rem' }, screens: { '2xl': '1280px' } },
    extend: {
      colors: {
        ink: { DEFAULT: '#0b0806', 900: '#0b0806', 800: '#120d09', 700: '#1a130d', 600: '#241a12' },
        espresso: '#2b1d13',
        bronze: { DEFAULT: '#8c5a2b', light: '#a8703a' },
        gold: { DEFAULT: '#c9a45c', light: '#e8cf8e', pale: '#f3e3b5', deep: '#9b7a3c' },
        cream: { DEFAULT: '#f4ead8', muted: '#d9ccb6' },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      backgroundImage: {
        'gold-metal': 'linear-gradient(115deg, #8c5a2b 0%, #c9a45c 22%, #f3e3b5 42%, #c9a45c 58%, #9b7a3c 78%, #e8cf8e 100%)',
        'gold-soft': 'linear-gradient(135deg, #e8cf8e 0%, #c9a45c 50%, #8c5a2b 100%)',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(201,164,92,.25), 0 20px 60px -20px rgba(201,164,92,.35)',
        card: '0 30px 80px -40px rgba(0,0,0,.9)',
      },
      keyframes: {
        shine: { '0%': { backgroundPosition: '0% 50%' }, '100%': { backgroundPosition: '200% 50%' } },
      },
      animation: { shine: 'shine 8s linear infinite' },
    },
  },
  plugins: [],
} satisfies Config;
