-- 021 — Challenges.
--
-- Run this in the Supabase SQL editor before challenges will sync. Until it
-- is applied, lib/sync.js steps over the challenges push and pull (see
-- optionalSync) and everything else keeps syncing — challenges just stay on
-- the device they were started on.
--
-- Safe to run against an existing database: it creates ONE new table, with
-- its policy and trigger, and touches nothing else. No ALTER on an existing
-- table, no DROP, no data migration. Re-runnable: every statement is
-- `if not exists` or checks first. Needs 014 (the deletions log) applied,
-- for the trigger's function.
--
-- ── What is NOT here, and why ──
--
-- Milestones need nothing new. A milestone level ("14-Day Streak",
-- "250K Held") is a key and the moment it was reached, exactly as a badge is,
-- so it is stored and synced as a row in `badges` (006) under its own key:
-- 'logging-14', 'held-250k'. The seven original badges that became levels on
-- a track kept their keys, so nothing already earned moves.
--
-- A challenge is different: it has a window, settings and an outcome that
-- changes while it runs. One row per attempt.

create table if not exists public.challenges (
  id          uuid not null default gen_random_uuid (),
  user_id     uuid not null,

  -- The stable identity every synced table carries (011). The push resolves
  -- conflicts on (user_id, sync_id), so the unique index below is what makes
  -- the upsert possible at all - see 016 for why it must not be partial.
  --
  -- No local_id, unlike the older tables: a challenge has its sync_id from
  -- the moment it is created, and matching on a device's own row number
  -- could only merge two different attempts. See challengeToRow.
  sync_id     uuid null,

  -- Which challenge: 'no-spend-weekend', 'category-cap' ...
  key         text not null,
  -- What it was started with: {"category": "Coffee", "cap": 1000},
  -- {"amount": 5000}, {"target": 1840} - or {} for most.
  params      jsonb not null default '{}'::jsonb,

  -- The window, as LOCAL calendar days 'YYYY-MM-DD', inclusive at both ends.
  -- text rather than date, as transaction_date is: they are compared as the
  -- client's own day keys, never converted through a timezone.
  start_day   text not null,
  end_day     text not null,

  -- 'active' | 'won' | 'lost' | 'quit'. Giving up is a status, not a
  -- delete; only a restore from an older backup removes an attempt.
  status      text not null default 'active',

  started_at  timestamp with time zone null,
  finished_at timestamp with time zone null,
  created_at  timestamp with time zone null default now(),
  -- Sent by the client, which compares it to decide which copy is newer.
  -- No set_updated_at trigger, as with every table but transactions.
  updated_at  timestamp with time zone null,

  constraint challenges_pkey primary key (id),
  constraint challenges_status_check check (status in ('active', 'won', 'lost', 'quit')),
  constraint challenges_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

-- The conflict target of pushTable('challenges', …, 'user_id,sync_id').
create unique index if not exists challenges_user_sync_id_key
  on public.challenges (user_id, sync_id);

create index if not exists challenges_user_id_idx on public.challenges (user_id);

-- ── Row-level security ──────────────────────────────────────────────────────
-- Not optional: the client reaches PostgREST with the public anon key, so
-- this policy is the only thing keeping one person's rows from another's.

alter table public.challenges enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'challenges'
      and policyname = 'challenges: own rows only'
  ) then
    create policy "challenges: own rows only"
      on public.challenges for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- ── Deletions ───────────────────────────────────────────────────────────────
-- When a restore drops an attempt, the device that restored deletes it here.
-- The trigger from 014 leaves a tombstone for that, so every other device
-- drops its copy on the next pull instead of pushing it straight back.

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'challenges_record_deletion'
      and tgrelid = 'public.challenges'::regclass
  ) then
    create trigger challenges_record_deletion
      after delete on public.challenges
      for each row execute function public.record_deletion();
  end if;
end $$;

-- ── Check it applied ────────────────────────────────────────────────────────
-- Read-only. Should list the table with RLS on, one policy and one trigger:
--
--   select c.relname, c.relrowsecurity,
--          (select count(*) from pg_policies p where p.tablename = c.relname) as policies,
--          (select count(*) from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal) as triggers
--   from pg_class c
--   where c.relname = 'challenges' and c.relnamespace = 'public'::regnamespace;
