-- 016 — The sync_id index has to be one ON CONFLICT can actually use.
--
-- ── What 011 got wrong ──
--
-- 011 created these PARTIAL:
--
--   create unique index … on public.debts (user_id, sync_id)
--     where sync_id is not null;
--
-- The reasoning was sound and the consequence was not. Every row at the time
-- had a null sync_id, and the worry was that a plain unique index would
-- reject the second one. It would not: Postgres treats NULLs as distinct, so
-- (user_id, null) never collides with (user_id, null). The predicate bought
-- nothing.
--
-- What it cost is that ON CONFLICT cannot use it. Postgres infers a conflict
-- target by matching the listed columns to a unique index, and a PARTIAL
-- index is only inferable when the statement repeats its predicate -
-- `on conflict (user_id, sync_id) where sync_id is not null`. PostgREST's
-- upsert emits no such clause and has no way to, so the moment the client
-- moved to `onConflict: 'user_id,sync_id'` every push came back with
--
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
--
-- and the whole table stopped syncing.
--
-- ── Plain, and it behaves the same ──
--
-- Unstamped rows still coexist, because NULLs remain distinct from each
-- other. Stamped rows are still unique per user. The only difference is that
-- the index is now inferable, which is the entire point of having it.
--
-- Verified before building: zero duplicate (user_id, sync_id) pairs across
-- all six tables, so every one of these creates without a rewrite.
--
-- ── The null row is still the client's problem ──
--
-- A row with no sync_id cannot conflict on one whatever shape the index is,
-- so upserting it always inserts. That is unbounded growth, not an error, and
-- it is guarded in pushTable rather than here - the database cannot tell an
-- unstamped row from a new one, and the client can.

drop index if exists public.accounts_user_sync_id_key;
drop index if exists public.categories_user_sync_id_key;
drop index if exists public.debts_user_sync_id_key;
drop index if exists public.recurring_user_sync_id_key;
drop index if exists public.templates_user_sync_id_key;
drop index if exists public.goals_user_sync_id_key;

create unique index if not exists accounts_user_sync_id_key
  on public.accounts (user_id, sync_id);
create unique index if not exists categories_user_sync_id_key
  on public.categories (user_id, sync_id);
create unique index if not exists debts_user_sync_id_key
  on public.debts (user_id, sync_id);
create unique index if not exists recurring_user_sync_id_key
  on public.recurring (user_id, sync_id);
create unique index if not exists templates_user_sync_id_key
  on public.templates (user_id, sync_id);
create unique index if not exists goals_user_sync_id_key
  on public.goals (user_id, sync_id);
