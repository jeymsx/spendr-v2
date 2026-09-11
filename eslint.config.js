import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/**
 * ESLint, flat config.
 *
 * The rules that matter here are the two that overlap the hand-rolled AST
 * checkers in scripts/: `no-undef` covers the same ground as scopecheck, and
 * react-hooks/rules-of-hooks covers hookcheck. Both are better than my
 * versions - they have years of edge cases behind them.
 *
 * The checkers are kept anyway, for now, because they run in about a second
 * over the whole tree and print a one-line verdict, which makes them cheap to
 * run after every patch. Once `npm run lint` is clean and habitual, scopecheck
 * and hookcheck are the two to retire; tdzcheck has no lint equivalent and
 * stays either way.
 *
 * Unused variables are an ERROR. They were a warning while a backlog of 33
 * existed; that backlog is now zero, and the reason to promote them is not
 * tidiness. Two of those 33 described real defects - a dead template sheet
 * that made a whole feature do nothing when tapped, and an option in
 * quickParse that was read and never passed, which silently invalidated a
 * published measurement. Both looked exactly like the 31 that were only
 * clutter. At zero, the next one fails the build instead of joining a crowd.
 */
export default [
  { ignores: ['dist/**', 'dev-dist/**', 'node_modules/**', 'seed-*.js'] },

  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      /* The React-19-era rules from eslint-plugin-react-hooks v7 are WARNINGS
         here, deliberately, and this is a judgement call worth recording.
 
         Measured on the first run: 134 problems, of which
           28  react-hooks/set-state-in-effect
            5  react-hooks/static-components
            1 each  purity, refs, use-memo, preserve-manual-memoization
 
         None of them is a crash. This is a React 18 app, and the two rules
         that DO catch the class of bug which has actually shipped here -
         no-undef and rules-of-hooks - both report zero, which is the useful
         result of adding eslint at all.
 
         At least two are false positives on inspection: Accounts' flagged
         "impure call during render" is a closure that only runs on tap, and
         CategoryGlyph's "component created during render" is a lookup from a
         static map, so the element type is stable.
 
         Left as errors, `npm run lint` would be red on day one, which teaches
         you to ignore it. As warnings it exits 0 today, so any NEW violation
         stands out - and the backlog is written down in plan.md rather than
         hidden here. AccountDetail's ref-write-during-render is the one worth
         fixing first: it is idempotent today, but it is the kind of thing
         that breaks under concurrent rendering. */
      /* Kept on, and worth the suppressions it costs.

         27 reports. Six were real and are fixed: a credit-card term that
         was cleared a render after the account changed, an Insights
         animation counter that re-rendered the page twice per range change,
         a desktop account selection that painted empty before correcting
         itself, and two transaction lists that rendered every loaded row
         once more under the new filter before cutting back to one page.

         The remaining 21 are correct as written and are suppressed at the
         line, each with its reason. Fifteen are one shape: a sheet loading
         its fields from a record when it opens. The documented alternative
         - unmount it, or give it a key - is not available to them, because
         each sheet renders null only after its own exit animation has run,
         so the parent cannot take it away at the moment it closes. The rest
         are a Dexie subscription, a sync kicked off on sign-in, two
         deliberate animation gates, and two reactions to navigation.

         So: a useful rule with a high false-positive rate against this
         codebase's sheet pattern, not a rule to switch off. A new
         setState-in-an-effect still has to justify itself. */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',

      /* Kept because it EARNED it. static-components found a real defect:
         FilterModal declared SectionLabel in its own body, making a new
         component type every render. Its one false positive - CategoryGlyph
         rendering a component looked up from a frozen module-level map - is
         suppressed at that line with a reason. */
      'react-hooks/static-components': 'warn',

      /* purity likewise: one site, suppressed with a reason, rule left on. */
      'react-hooks/purity': 'warn',

      /* OFF. These two are React Compiler rules, and this app does not use
         the compiler. Between them they produced exactly two reports, both
         wrong, and neither could be suppressed at the point it complained
         about - the ranges they report do not line up with an
         eslint-disable-next-line, so the directive lands as "unused" while
         the warning stays.

         use-memo wanted a lazy useState initialiser hoisted, which would
         change when the clock is read. preserve-manual-memoization objected
         to a deliberately hand-narrowed dependency list, which is the whole
         point of the line it flagged. Neither has caught anything real here,
         and both cost more attention than they return. Revisit if this app
         ever adopts the compiler. */
      'react-hooks/use-memo': 'off',
      'react-hooks/preserve-manual-memoization': 'off',

      // The one that catches the class of bug that has actually shipped here.
      'no-undef': 'error',

      /* An ERROR, now that the count is zero - see the note at the top.
         Args and rest siblings stay exempt because destructuring-to-omit is
         a deliberate idiom, and a leading underscore is the escape hatch for
         something genuinely kept on purpose. */
      'no-unused-vars': ['error', {
        args: 'none',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_',
      }],

      // `catch {}` with a comment is used throughout for storage that may be
      // unavailable in private mode. That is deliberate, not sloppy.
      'no-empty': ['error', { allowEmptyCatch: true }],

      /* OFF, and this is a trade rather than a surrender.

         It fired 55 times across 14 files, and every one is a deliberate
         pattern this codebase is built on:

           25  icons.jsx      exports `const IconBell = uui(Bell01)` - these
                              ARE components, but they are call results, so
                              allowConstantExport cannot see that
           12  Accounts.jsx   exports the rows and sections AccountDetail
                              reuses, alongside its own page
            3  the contexts   each exports a Provider and its useX hook,
                              which is the standard React context shape

         The rule is about ONE thing: Vite's fast refresh needs every export
         in a module to be a component, or editing that file triggers a full
         page reload instead of a hot swap. It has no effect on the build, on
         correctness, or on what ships.

         Satisfying it would mean 25 icon files, or splitting every context
         in two, to buy faster hot reloads in three files nobody edits often.
         Fifty-five permanent warnings cost more than that: this session lost
         a dead feature and a bad measurement inside a warning stream, and
         the fix for that is fewer warnings that are all real, not more.

         What is given up, written down so it is a decision and not a
         surprise: editing icons.jsx, Accounts.jsx or a context does a full
         reload rather than a hot swap. */
      'react-refresh/only-export-components': 'off',
    },
  },

  // Node scripts and config files run outside the browser.
  {
    files: ['scripts/**/*.mjs', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Vitest injects its own globals only where configured; these files import
  // them explicitly, so this block just adds the Node ones they use.
  {
    files: ['**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.node } },
  },
]
