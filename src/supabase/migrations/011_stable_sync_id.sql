-- 011 — A stable identity for the rows that sync.
--
-- ── The bug this exists to end ───────────────────────────────────────────
--
-- Three tables resolve conflicts on (user_id, local_id):
--
--     debts, recurring, templates
--
-- local_id is a Dexie auto-increment key, and Dexie does not reset the
-- counter on clear(). Restore a JSON backup and every row comes back with a
-- DIFFERENT id than the one the server has. The next push then matches
-- nothing, so every UPDATE becomes an INSERT and the table doubles.
--
-- This is not hypothetical. As of this migration the remote holds:
--
--     templates   6 rows for 3 real templates   (ids 1,2,3 twinned to 4,5,6)
--     recurring   8 rows for 4 real bills       on two other accounts
--     debts      28 rows for 14 real debts      ids 3..17 twinned to 18..31
--
-- always a clean partition with a constant offset, which is the signature of
-- a whole table re-inserted under shifted ids. It is also what made a deleted
-- bill come back: the delete was queued against a local_id the server no
-- longer knew, so it matched nothing and the next pull restored the row.
--
-- The other tables were never exposed to this. transactions resolve on
-- (user_id, tx_id) and badges on (user_id, key), both already stable;
-- accounts, categories and goals resolve on the name, which survives an id
-- shift (it breaks on a RENAME instead, which is a separate and much rarer
-- problem this column also happens to fix later).
--
-- ── Why a column and not a fixed local_id ────────────────────────────────
--
-- local_id cannot be repaired, because there is nothing to repair it against.
-- The number is meaningless outside the database that issued it, and after a
-- restore even that database disagrees with its own past. An identity has to
-- be minted once, by the client, and travel with the row forever. That is
-- what syncId is locally (db.js v11) and what this column receives.
--
-- ── Safe to run today, and inert until the client uses it ────────────────
--
-- Six nullable columns and six PARTIAL unique indexes. Nothing is rewritten,
-- no constraint is dropped, and no conflict target changes here - the client
-- still resolves on local_id after this runs, exactly as it does now.
--
-- The indexes are partial (where sync_id is not null) on purpose. Every row
-- that exists right now has a null sync_id, and a plain unique index would
-- reject the second one. Partial lets old and stamped rows coexist for as
-- long as the transition needs, which is what makes this deployable while a
-- phone is running last week's build.
--
-- Reversing it is `drop column sync_id`, and the indexes go with it.

alter table public.accounts   add column if not exists sync_id text;
alter table public.categories add column if not exists sync_id text;
alter table public.debts      add column if not exists sync_id text;
alter table public.recurring  add column if not exists sync_id text;
alter table public.templates  add column if not exists sync_id text;
alter table public.goals      add column if not exists sync_id text;

create unique index if not exists accounts_user_sync_id_key
  on public.accounts (user_id, sync_id) where sync_id is not null;

create unique index if not exists categories_user_sync_id_key
  on public.categories (user_id, sync_id) where sync_id is not null;

create unique index if not exists debts_user_sync_id_key
  on public.debts (user_id, sync_id) where sync_id is not null;

create unique index if not exists recurring_user_sync_id_key
  on public.recurring (user_id, sync_id) where sync_id is not null;

create unique index if not exists templates_user_sync_id_key
  on public.templates (user_id, sync_id) where sync_id is not null;

create unique index if not exists goals_user_sync_id_key
  on public.goals (user_id, sync_id) where sync_id is not null;
