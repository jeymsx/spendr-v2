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
 * Unused variables are a WARNING, not an error. There is a real backlog of
 * them - two dead imports in Dashboard predate this config - and turning them
 * into errors would mean either a large unrelated cleanup or `npm run lint`
 * being permanently red, which trains you to ignore it.
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
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',

      // The one that catches the class of bug that has actually shipped here.
      'no-undef': 'error',

      // A backlog exists; see the note above. Args and rest siblings are
      // exempt because destructuring-to-omit is a deliberate idiom.
      'no-unused-vars': ['warn', {
        args: 'none',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_',
      }],

      // `catch {}` with a comment is used throughout for storage that may be
      // unavailable in private mode. That is deliberate, not sloppy.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Fast-refresh only works if a module's exports are all components.
      // Warning, because Settings.jsx deliberately exports sheets AND helpers
      // that the web layer reuses.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
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
