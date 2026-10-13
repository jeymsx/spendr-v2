-- 008 — Renaming an account or a category no longer breaks sync.
--
-- ── The bug ──────────────────────────────────────────────────────────────
--
-- `accounts` and `categories` each carry TWO unique constraints:
--
--     accounts    unique (user_id, local_id)   and   unique (user_id, name)
--     categories  unique (user_id, local_id)   and   unique (user_id, name, type)
--
-- and pushTable (src/lib/sync.js) upserts them on the NAME-based one. That is
-- the right conflict target and the comment above pushTable says why: the
-- IndexedDB auto-increment counter does not reset on `table.clear()`, so a
-- local_id can shift after a reset while a name stays put.
--
-- Now rename "GCash" to "GCash Main" and sync:
--
--   1. The push is ON CONFLICT (user_id, name).
--   2. No remote row has the new name, so Postgres takes the INSERT branch.
--   3. That INSERT carries the SAME local_id as the existing remote row.
--   4. `accounts_user_id_local_id_key` rejects it. 23505.
--
-- The conflict target cannot resolve a violation of a DIFFERENT constraint,
-- so there is no upsert that survives this. pushTable throws, syncToSupabase
-- awaits each push in sequence, and everything after the failing table stops
-- too. Sync stays broken until someone deletes the remote row by hand.
--
-- ── Why dropping is the fix, and not switching the conflict target ────────
--
-- Pointing the upsert at (user_id, local_id) instead would trade this bug for
-- the one the name target exists to avoid: after a local reset the ids shift,
-- every row inserts as new, and the account list doubles.
--
-- The second constraint buys nothing. Nothing reads local_id as an identity:
-- the pull matches on it as a fast path and falls straight back to the name
-- (pullSimpleTable), so a null or a duplicate there costs a lookup, not a row.
-- A unique constraint on a column that is not the conflict target and is not
-- an identity is pure liability.
--
-- This is settled elsewhere in this schema already. 004_goals.sql deliberately
-- omits `unique (user_id, local_id)` and explains, under DIVERGENCE 1, that
-- having it "would be actively harmful" for exactly this reason. Goals got it
-- right; accounts and categories predate that understanding.
--
-- ── Safe to run, and safe to run twice ───────────────────────────────────
--
-- Two DROP CONSTRAINT IF EXISTS. No column is read, rewritten or re-keyed, no
-- row is touched, and nothing is deleted. Dropping a unique constraint can
-- never fail on existing data the way adding one can - it only ever permits
-- more than it did before.
--
-- The remaining constraints still stop real duplicates: two accounts cannot
-- share a name, and two categories cannot share a name and type. Those are
-- the rules that matter, and they are the ones the app enforces locally too.
--
-- Order does not matter. Before this runs, a rename breaks sync and the client
-- works around it by retrying without local_id (see pushTable). After it runs,
-- the rename is an ordinary insert and the workaround never fires.

alter table public.accounts
  drop constraint if exists accounts_user_id_local_id_key;

alter table public.categories
  drop constraint if exists categories_user_id_local_id_key;

-- Transactions keep theirs. They upsert on (user_id, tx_id), and a tx_id is a
-- client-generated UUID that never changes for the life of a row - so a push
-- is always the UPDATE branch and never tries to insert a duplicate local_id.
-- Debts, recurring and templates keep theirs too: they upsert on local_id
-- itself, which is the one case where the constraint IS the conflict target.
