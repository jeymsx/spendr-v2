# How Spendr is built

A short map of the moving parts. The reasons live next to the code, in the
comments, so this only says where to look.

## Local first

Everything a person logs is written to IndexedDB on their device first
(Dexie, `src/db/db.js`). The app works offline and never waits on the
network to save. Supabase is the copy that other devices sync from.

- **Schema:** `src/db/db.js`, one `db.version(n)` per change. Record shapes
  are declared once in `src/types.d.ts`.
- **Writes:** `src/db/*.js` (transactions, balances, trash, bills, wishes).
  Pages call these rather than writing tables directly.
- **Balances are worked out, not stored by hand.** An account's balance is
  its opening plus its transactions (`src/db/balances.js`). A direct balance
  write gets undone on the next reconcile.

## Sync (`src/lib/sync.js`, `src/components/SyncManager.jsx`)

- **Transactions** sync by a watermark: the cloud stamps `updated_at`, and
  each device pulls rows newer than the last one it saw.
- **Small tables** (accounts, categories, bills, goals, wishes and so on) sync
  row by row. Each row has a stable `syncId`; newest `updatedAt` wins, and a
  row this device hasn't sent yet is never overwritten by a pull.
- **Deletes** go through a tombstone log (`deletions`), so other devices
  remove the row too.
- **Live:** Supabase Realtime tells devices a table changed
  (`src/lib/realtime.js`), and a new transaction is also sent device to device
  directly (`src/lib/liveShare.js`).
- **First sync** on a device that already has data asks whether to keep this
  device's data, the account's, or both (`src/lib/firstSync.js`).
- **Optional steps:** a table or column added by a migration that hasn't been
  run yet is skipped, not fatal (`optionalSync`, `OPTIONAL_COLS`), so an
  update can ship before its migration runs.

## The cloud (`supabase/`)

- **Migrations:** `supabase/migrations/NNN_name.sql`, numbered, run by hand
  in the Supabase SQL editor, in order. Each one is safe to run twice.
- **Row-level security:** every table is "own rows only".
- **Edge function:** `supabase/functions/send-reminders` sends push reminders
  on a schedule (pg_cron, see `020_push_reminders.sql`).

## Phone and computer

- **Phone:** pages in `src/pages`, routes in `src/App.jsx`, shell in
  `src/layouts/AppLayout.jsx`.
- **Computer:** `src/web`. Some pages are desktop pages of their own
  (`src/web/pages`, laid out by `src/web/ui/Page.jsx`); the rest reuse the
  phone's page inside the desktop frame (`PhonePage`, `RouteDrawer`). Routes
  are in `src/web/WebApp.jsx`.
- **Shared UI:** `src/components/ui` holds the primitives (Button, Sheet,
  Field and the rest). `npm run check` flags hand-rolled versions of them.

## Logic

- `src/lib`: domain rules, mostly pure functions with tests beside them
  (budgets, goals, forecast, recap, quick log, wishes, help centre text).
- `src/utils`: small helpers (dates, money input, installments, credit cycles).
- `src/hooks`, `src/context`: React glue.

## Words people read

- **Help centre:** `src/lib/help.js`, shared with the website in `site/`.
- **What's New and the changelog:** `src/lib/release.js` and
  `src/lib/changelog.js`. See [releasing.md](releasing.md).
- **Privacy policy and terms:** `src/lib/policy.js`.

## The website (`site/`)

A separate Astro project for the landing page. It reads the help centre from
`src/lib/help.js`, and its screenshots are captured from the real app by
`site/scripts/capture.mjs`.
