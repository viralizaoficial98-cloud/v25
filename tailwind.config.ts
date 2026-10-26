import type { Config } from 'tailwindcss';

/**
 * White Premium: fundos brancos/off-white (`paper`), texto quase preto (`fg`),
 * acentos dourados/bronze. Todas as cores vêm de variáveis CSS (src/index.css),
 * por isso os modificadores de opacidade (ex.: `fg/60`) continuam a funcionar.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1.25rem', md: '2rem' }, screens: { '2xl': '1280px' } },
    extend: {
      colors: {
        paper: { DEFAULT: v('paper'), soft: v('paper-soft'), muted: v('paper-muted'), strong: v('paper-strong') },
        fg: { DEFAULT: v('fg'), muted: v('fg-muted') },
        gold: { DEFAULT: v('gold'), light: v('gold-light'), pale: v('gold-pale'), deep: v('gold-deep'), bright: v('gold-bright') },
        espresso: v('espresso'),
        bronze: { DEFAULT: '#8c5a2b', light: '#a8703a' },
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      backgroundImage: {
        // Ouro mais profundo para manter contraste sobre branco
        'gold-metal': 'linear-gradient(115deg, #6e4a1c 0%, #a87a33 24%, #c9a04f 44%, #a87a33 62%, #7a5520 82%, #b8893a 100%)',
        'gold-button': 'linear-gradient(120deg, #d9b56a 0%, #c9a45c 35%, #e8cf8e 55%, #c9a45c 75%, #b8893a 100%)',
        'gold-soft': 'linear-gradient(135deg, #f7efe0 0%, #f3e7cf 50%, #ead8b5 100%)',
      },
      boxShadow: {
        glow: '0 10px 30px -12px rgba(154,116,50,.45)',
        card: '0 24px 60px -32px rgba(23,19,15,.28), 0 2px 8px -4px rgba(23,19,15,.08)',
        soft: '0 8px 28px -18px rgba(23,19,15,.25)',
      },
      keyframes: {
        shine: { '0%': { backgroundPosition: '0% 50%' }, '100%': { backgroundPosition: '200% 50%' } },
      },
      animation: { shine: 'shine 8s linear infinite' },
    },
  },
  plugins: [],
} satisfies Config;
