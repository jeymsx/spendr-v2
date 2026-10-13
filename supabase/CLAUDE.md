# The cloud side (supabase/)

`migrations/` is the database, one numbered SQL file per change.
`functions/send-reminders` is the only server code.

## Migrations

- **The owner runs them** in the Supabase SQL editor. Don't apply one to the
  live project; read-only queries are fine when asked. Say in your reply which
  file needs running, and whether it must run before the push.
- Name it `NNN_short_name.sql`, numbered after the last file. Open with a
  comment: what it's for, and how the app copes before it has run.
- **Safe to run twice:** `if not exists` on tables, columns and indexes;
  `drop trigger if exists` before `create trigger`; policies and publication
  membership inside a `do $$` block that checks `pg_policies` or
  `pg_publication_tables` first.
- **People's data stays put.** Never drop or rewrite a column that holds
  their rows. When a change touches existing rows, try it first against a
  copy (PGlite, `@electric-sql/pglite`, with a small `auth` schema shim).
- The app has to work before it runs: new tables sync through
  `optionalSync`, new columns go in `OPTIONAL_COLS` (`src/lib/sync.js`).

## A new synced table

Copy `037_wishes.sql`. Each table has:

- `id uuid`, `user_id` referencing `auth.users` on delete cascade, and
  `sync_id uuid` with a unique index on `(user_id, sync_id)`;
- `updated_at` sent by the client, which keeps the newest copy;
- size checks on its text columns;
- row level security with one "own rows only" policy on
  `(select auth.uid()) = user_id`; the `select` makes Postgres work it out
  once per query instead of once per row (036);
- the triggers `record_deletion` (019), `record_history` (025),
  `skip_stale_update` (032) and `enforce_row_cap` (035);
- a place in the `supabase_realtime` publication (030).

The app's half of the checklist is in the root `CLAUDE.md`.

## send-reminders

pg_cron calls it every 15 minutes (020) to send push reminders that are due.
It never reads a transaction, an account or a balance: the phone uploads only
the time and the words. It has no imports, so Vitest runs it
(`index.test.ts`) and it can be pasted into the dashboard's function editor as
one file. Its secrets are listed at the top of `index.ts`.
