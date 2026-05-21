import plugin from 'tailwindcss/plugin'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary, #2D9DFF)',
        'primary-dark': 'var(--color-primary, #2D9DFF)',
        navy: '#0b0f14',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '18px',
        '3xl': '24px',
        '4xl': '30px',
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        '.pb-safe':           { paddingBottom: 'env(safe-area-inset-bottom, 0px)' },
        '.pt-safe':           { paddingTop:    'env(safe-area-inset-top,    0px)' },
        '.mb-safe':           { marginBottom:  'env(safe-area-inset-bottom, 0px)' },
        '.min-h-screen-safe': { minHeight:     '100dvh' },
      })
    }),
  ],
}
