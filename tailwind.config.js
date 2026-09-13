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
        /* The app's three surfaces. Defined in index.css and swapped under
           html.dark, so `bg-page` is correct in both themes and a call site
           never spells a light/dark pair again. See the note there. */
        page:   'var(--surface-page, #f8fafc)',
        panel:  'var(--surface-panel, #ffffff)',
        lifted: 'var(--surface-lifted, #ffffff)',
        /* The dark lifted surface, unconditionally. Onboarding is drawn in the
           dark palette whatever the theme setting - 28 unconditional
           `text-white`, not one `dark:` variant - so a theme-aware token would
           turn its dialogs white in light mode. This is the same value the
           swap uses, not a second copy of it. */
        'dark-lifted': 'var(--dark-lifted, #1a2130)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      /* ── The steps Tailwind does not have ──────────────────────────────────
       *
       * The app was written with 31 distinct `text-[Npx]` values across 434
       * call sites, alongside 437 uses of Tailwind's own scale. Not two
       * systems so much as one system and a habit: whenever a size fell
       * between xs and sm, or sm and base, someone typed the number.
       *
       * Those in-between sizes are real and they earn their place - 11px is
       * the app's caption, 13px its row text, 15px its form rows, 17px its
       * sheet titles - so they are named here rather than argued away. What
       * goes is the typing: `text-[13px]` becomes `text-13`, the set is
       * closed, and scripts/designcheck.mjs fails a build that invents a
       * thirty-second one.
       *
       * NO line-height, deliberately. Tailwind's named steps each ship one
       * (text-sm is 14px over 20px); `text-[14px]` ships none and inherits
       * the body's 1.5. These tokens replace the second kind, so they have to
       * behave like it - give them a line-height and 282 call sites silently
       * reflow. That difference is also why `text-12` is not a synonym for
       * `text-xs` and neither is spelled as the other.
       *
       * Numbers rather than t-shirt sizes: there is no honest name for the
       * step between xs and sm, and `text-13` cannot be misread.
       */
      fontSize: {
        10: '10px',
        11: '11px',
        12: '12px',
        13: '13px',
        14: '14px',
        15: '15px',
        16: '16px',
        17: '17px',
        18: '18px',
        20: '20px',
        /* Display. The hero figure is 38 on six screens and the onboarding
           heading 28 on seven, so these two are already a scale; the rest are
           named so the strays have somewhere to go. */
        22: '22px',
        28: '28px',
        32: '32px',
        34: '34px',
        38: '38px',
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
