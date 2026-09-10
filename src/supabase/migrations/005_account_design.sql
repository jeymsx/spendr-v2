-- 005 — Card face design.
--
-- Which decorative pattern an account's card face wears. See
-- src/lib/cardDesigns.js; the values are the design keys ('classic',
-- 'aurora', 'ripple', 'wave', 'weave'), and a null or unknown value renders
-- as 'classic', so no backfill is needed.
--
-- Safe to run: one ADD COLUMN IF NOT EXISTS on an existing table, nullable,
-- no default to write and no rows touched.
--
-- ── ORDER DOES NOT MATTER ────────────────────────────────────────────────
-- You can run this before or after deploying the client, and you can not run
-- it at all without breaking anything.
--
-- pushTable('accounts', …) sends every local account in one upsert and
-- PostgREST rejects the whole request if it names a column the table does not
-- have - so a naive mapping would have stopped accounts syncing altogether
-- until this ran. Instead the push drops `design` and retries once when the
-- error says the column is unknown (see OPTIONAL_COLS in src/lib/sync.js).
--
-- So: before this runs, the design is stored locally and is per-device, and a
-- warning is logged on each sync. After it runs, design syncs like every other
-- account field, with nothing to switch on.

alter table public.accounts
  add column if not exists design text;
