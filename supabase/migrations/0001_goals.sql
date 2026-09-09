-- Savings goals.
--
-- Run this in the Supabase SQL editor before goals will sync. Until it is
-- applied, lib/sync.js steps over the goals push and pull (see optionalSync)
-- and everything else keeps syncing - goals just stay on the device.
--
-- Shape follows the local schema in src/db/db.js v9: funding accounts live
-- inline as a jsonb array rather than in a join table, so a goal and the
-- accounts it draws on are one row and can never arrive half-synced.
--
-- There is deliberately NO `saved` or `allocated` column. Progress is derived
-- from real account balances at read time (src/lib/goals.js). A stored figure
-- would need topping up by hand, would drift from the balance it claims to
-- describe, and would have to be reconciled on every device.

create table if not exists public.goals (
  id          bigserial primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,

  -- The client's IndexedDB id. Carried for parity with the other tables, but
  -- NOT the conflict target: IndexedDB's auto-increment counter does not reset
  -- on table.clear(), so local ids can shift after a device reset. The name is
  -- what stays stable, which is the same reasoning accounts and categories use.
  local_id    bigint,

  name        text        not null,
  icon        text,
  target      numeric(14, 2) not null default 0,

  -- Account NAMES, matching how transactions, balances and parent_name key
  -- accounts everywhere else in this schema. Renames cascade client-side in
  -- pages/Accounts.jsx.
  accounts    jsonb       not null default '[]'::jsonb,

  target_date date,
  priority    integer     not null default 0,
  archived_at timestamptz,
  created_at  timestamptz default now(),
  updated_at  timestamptz not null default now(),

  -- The upsert conflict target used by pushTable('goals', …, 'user_id,name').
  constraint goals_user_name_key unique (user_id, name)
);

-- The only query the client makes is "every goal for this user", so one index
-- on user_id is the whole access pattern. Ordering by priority happens on a
-- handful of rows, client-side, and does not earn an index.
create index if not exists goals_user_id_idx on public.goals (user_id);

-- ── Row-level security ──────────────────────────────────────────────────────
-- Without this, `anon` can read every user's goals: the client talks to
-- PostgREST directly with a publishable key, so the table's own policies are
-- the only thing standing between one user's data and another's.

alter table public.goals enable row level security;

drop policy if exists "goals are private to their owner" on public.goals;
create policy "goals are private to their owner"
  on public.goals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
