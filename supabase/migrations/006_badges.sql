-- 006 — Badges.
--
-- Run this in the Supabase SQL editor. Until it is applied, lib/sync.js steps
-- over the badges push and pull (see optionalSync) and everything else keeps
-- syncing — badges just stay on the device, which is where they are earned
-- anyway.
--
-- Safe to run against an existing database: it creates ONE new table and
-- touches nothing else. No ALTER on an existing table, no DROP, no data
-- migration. If a `badges` table somehow already exists this is a no-op, so
-- verify the shape below rather than assuming it applied.
--
-- Shape follows 004_goals.sql, with one deliberate divergence called out where
-- it occurs.

create table if not exists public.badges (
  id      uuid not null default gen_random_uuid (),
  user_id uuid not null,

  -- The badge's definition key: 'first-peso', 'green-month', 'six-figures'.
  --
  -- DIVERGENCE: there is no `local_id` here, and this is the only table
  -- without one. Every other table has a client-side autoincrement id that
  -- means nothing remotely but has to be carried to match rows up. Badges do
  -- not: the key IS the identity, it is the primary key in IndexedDB too (see
  -- db/db.js v10), it is stable across devices, and it survives a local
  -- database reset — which an autoincrement id does not, since the counter
  -- does not rewind on table.clear().
  --
  -- That also makes the upsert conflict target honest. Other tables resolve on
  -- (user_id, local_id) or (user_id, name) as a proxy for "the same record";
  -- here (user_id, key) IS the record.
  key text not null,

  -- When it was earned. The one fact the client cannot recompute: most of
  -- these have no date in the ledger to derive from, and for the ones that do
  -- the answer would move every time the data behind it changed.
  --
  -- timestamptz, not text: unlike transaction_date or next_date this is an
  -- instant rather than a calendar day, and it is only ever formatted for
  -- display, never compared against a local 'YYYY-MM-DD' string.
  earned_at  timestamp with time zone null default now(),
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null,

  constraint badges_pkey primary key (id),
  -- The upsert conflict target used by pushTable('badges', …, 'user_id,key').
  -- Without this constraint the push fails outright: Postgres has nothing to
  -- resolve ON CONFLICT against.
  constraint badges_user_id_key_key unique (user_id, key),
  constraint badges_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
);

-- The only query the client makes is "every badge for this user" — at most ten
-- rows. The index is here for the FK join and for consistency with the other
-- tables, not because ten rows need one.
create index if not exists badges_user_id_idx on public.badges (user_id);

-- ── Row-level security ──────────────────────────────────────────────────────
-- Not optional. The client talks to PostgREST directly with the anon key
-- (VITE_SUPABASE_ANON_KEY, shipped in the bundle), so this policy is the only
-- thing standing between one user's rows and another's. Badges are not
-- sensitive the way a ledger is, but "which achievements has this person
-- earned" is still derived from their spending, and the table is reachable by
-- anyone holding a key that is public by design.
--
-- No set_updated_at trigger, deliberately: only transactions and
-- user_preferences have one. The client sends updated_at and pullSimpleTable
-- compares it against the local value to decide who wins, so a server-side
-- overwrite would distort that comparison.

alter table public.badges enable row level security;

-- Re-runnable WITHOUT a `drop policy if exists` in front of it. The drop would
-- be harmless — the policy name is one this file invents, on a table this file
-- creates — but Supabase's SQL editor flags any query containing DROP as
-- "potentially destructive" on a plain keyword scan, and a dialog warning you
-- about permanent data loss is a bad thing to dismiss on trust just to add a
-- table. Checking pg_policies first is idempotent the same way, with nothing
-- in it that can remove anything.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'badges'
      and policyname = 'badges: own rows only'
  ) then
    create policy "badges: own rows only"
      ON public.badges FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  end if;
end $$;
