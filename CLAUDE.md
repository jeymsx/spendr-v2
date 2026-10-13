# Spendr: notes for working on this repo

Spendr is a local-first personal finance PWA for the Philippines (React 18,
Vite, Tailwind 4, Dexie, Supabase). It has a phone layout and a computer
layout. The owner and their brother use it daily; simple UX wins over more
features.

Read [docs/architecture.md](docs/architecture.md) for how it fits together,
and [docs/releasing.md](docs/releasing.md) before any push.

## Commands

```bash
npm run dev      # Vite on :5173 (the owner keeps their own server on :5174)
npm run check    # types + AST checks; run it, a green build proves nothing
npm test         # vitest
npm run lint
npm run build
```

## Pushing and versions

- **Never push until the owner says so.** Commit locally; a push deploys.
- **Every push bumps the version** in `package.json`, once, by semantic
  versioning: MAJOR (relearn / removed / migration must run first), MINOR
  (anything new), PATCH (fixes only). Update What's New in
  `src/lib/release.js` and move the last release into `src/lib/changelog.js`.
  Steps in [docs/releasing.md](docs/releasing.md).
- Work on a branch, merge to `main` fast-forward, then push both.
- No attribution lines in commit messages.

## Database changes

- New tables and columns go in `supabase/migrations/NNN_name.sql`, numbered
  after the last one, safe to run twice.
- **The owner runs migrations** in the Supabase SQL editor. Don't apply them
  to the live project yourself; read-only queries are fine when asked.
- The app must keep working before a migration runs: new tables sync through
  `optionalSync`, new columns go in `OPTIONAL_COLS` (`src/lib/sync.js`).
- A new synced table needs: Dexie version (`src/db/db.js`), `SYNCED_TABLES`,
  `SMALL_TABLES` with row mappers, the pull, `REALTIME_TABLES`, backups
  (`src/lib/backup.js`) and `clearLocalLedger`. `wishes` is a recent example.
- The SQL side of a new table is in `supabase/CLAUDE.md`.

## Writing UI

- Use the primitives in `src/components/ui` (Button, Sheet, Field, Card ...).
  `npm run check` flags hand-rolled versions.
- Every feature needs both layouts: the phone page in `src/pages`, and the
  computer's route in `src/web/WebApp.jsx` (its own page or the phone's page
  in `PhonePage` / `RouteDrawer`).
- Lists are cards: a heading, then one card with hairline-separated rows.
- Motion: smooth, no bounce, no glows or gradients.
- Check UI in a real browser at phone (393px) and desktop (1440px) widths,
  light and dark, before calling it done. The browser checks in `dev/qa`
  (see its README) do this and stay in the repo; add one for a new feature.

## Words people read

- Sentence case, no all caps, no em dashes (the check enforces dashes).
- Short: "vs last week", not "vs the week before".
- Help centre articles live in `src/lib/help.js` and are shared with the
  website, so keep them true when behaviour changes.
- Notes stay out of What's New for now.

## Code style

- Comments explain why, in plain sentences, above the code they're about.
- `src/lib`, `src/db`, `src/utils` and `src/hooks` are type-checked from
  JSDoc: give new functions `@param` types.
- Tests sit beside the file they test (`thing.test.js`).
- A hook exported next to components breaks Fast Refresh: give hooks and
  contexts their own module.

## Traps that have bitten before

- Windows paths are case-insensitive: `trend.js` shadowed `Trend.jsx`. Name
  logic modules distinctly from components.
- React StrictMode runs effects twice in dev; a cleanup that flips module
  state breaks things only in dev.
- `src/web/pro.css` is unlayered, so it beats Tailwind utilities; put desktop
  defaults in `@layer components`.
- Never write `balance` directly; it's worked out from the ledger
  (`src/db/balances.js`).
- Bash heredocs eat backslashes; write files with an editor tool instead.

## Where things are

| Need | Look in |
|---|---|
| A phone page | `src/pages/*.jsx`, routes in `src/App.jsx` |
| A desktop page | `src/web/pages`, routes in `src/web/WebApp.jsx` (see `src/web/CLAUDE.md`) |
| Sync | `src/lib/sync.js`, `src/components/SyncManager.jsx` |
| Notifications and push reminders | `src/lib/notifications.js`, `src/lib/reminders.js` |
| What's New | `src/lib/release.js`, `src/lib/changelog.js` |
| Help centre | `src/lib/help.js` |
| Dev-only pages | `dev/` (see `dev/README.md`) |
| Browser checks | `dev/qa` (see `dev/qa/README.md`) |
| The website | `site/` (see `site/CLAUDE.md`) |
| The database and the edge function | `supabase/` (see `supabase/CLAUDE.md`) |
| Old design notes | `docs/plans/` (historical; the code wins) |
