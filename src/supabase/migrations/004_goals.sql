-- 004 — Savings goals.
--
-- Run this in the Supabase SQL editor before goals will sync. Until it is
-- applied, lib/sync.js steps over the goals push and pull (see optionalSync)
-- and everything else keeps syncing — goals just stay on the device.
--
-- Safe to run against an existing database: it creates ONE new table and
-- touches nothing else. No ALTER on an existing table, no DROP, no data
-- migration. If a `goals` table somehow already exists, `if not exists` makes
-- this a no-op — so verify the shape below rather than assuming it applied.
--
-- Shape follows the conventions in 001_init.sql and 003_schema.sql: uuid
-- primary key, nullable columns, plain `numeric`, dates as `text`, and the
-- same FK and policy naming. Two deliberate divergences are called out where
-- they occur.

create table if not exists public.goals (
  id          uuid not null default gen_random_uuid (),
  user_id     uuid not null,

  -- The client's IndexedDB id, carried like every other table.
  --
  -- DIVERGENCE 1: there is no `unique (user_id, local_id)` here, though
  -- accounts, categories, debts, recurring, templates and transactions all
  -- have one. It is not just unnecessary, it would be actively harmful:
  -- pushTable upserts goals with onConflict 'user_id,name', so renaming a goal
  -- makes the push an INSERT (no remote row has the new name) carrying the
  -- SAME local_id as the existing remote row — which a unique constraint on
  -- local_id would then reject, breaking sync until the row is deleted by
  -- hand. A second unique constraint on a column that is not the conflict
  -- target buys nothing and costs that.
  local_id    integer null,

  name        text null,
  icon        text null,
  target      numeric null,

  -- DIVERGENCE 2: jsonb, the only non-scalar column in this schema.
  --
  -- A goal's funding accounts live inline rather than in a join table: no
  -- query needs a link on its own, there are a handful of goals rather than
  -- thousands, and a join table would bring orphan rows, a second table to
  -- sync, and two client-side cascades to keep in step on every rename and
  -- delete instead of one array to map over. Keeping it inline here means a
  -- goal and its accounts are one row and can never arrive half-synced.
  --
  -- These are account NAMES, matching how transactions.from_account,
  -- recurring.account and accounts.parent_name all key accounts. Renames
  -- cascade client-side in pages/Accounts.jsx.
  accounts    jsonb null default '[]'::jsonb,

  -- text, not date — every other date in this schema is text
  -- (transactions.transaction_date, recurring.next_date, debts.due_date) and
  -- the client reads it straight back as a 'YYYY-MM-DD' string.
  target_date text null,

  priority    integer null default 0,
  archived_at timestamp with time zone null,
  created_at  timestamp with time zone null default now(),
  updated_at  timestamp with time zone null,

  constraint goals_pkey primary key (id),
  -- The upsert conflict target used by pushTable('goals', …, 'user_id,name').
  -- Without this constraint the push fails outright: Postgres has nothing to
  -- resolve ON CONFLICT against.
  constraint goals_user_id_name_key unique (user_id, name),
  constraint goals_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
);

-- The only query the client makes is "every goal for this user". Ordering by
-- priority happens on a handful of rows, client-side, and does not earn an
-- index of its own.
create index if not exists goals_user_id_idx on public.goals (user_id);

-- ── Row-level security ──────────────────────────────────────────────────────
-- Not optional. The client talks to PostgREST directly with the anon key
-- (VITE_SUPABASE_ANON_KEY, shipped in the bundle), so this policy is the only
-- thing standing between one user's goals and another's.
--
-- No set_updated_at trigger, deliberately: only transactions and
-- user_preferences have one. The client sends updated_at and
-- pullSimpleTable compares it against the local value to decide who wins, so
-- a server-side overwrite would distort that comparison.

alter table public.goals enable row level security;

drop policy if exists "goals: own rows only" on public.goals;
create policy "goals: own rows only"
  ON public.goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
