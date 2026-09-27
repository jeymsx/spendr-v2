-- 022 — Recently deleted, synced.
--
-- Run this in the Supabase SQL editor to sync Recently deleted between your
-- devices. Until it is applied, lib/sync.js steps over the trash push and
-- pull (see optionalSync) and everything else keeps syncing — Recently
-- deleted just stays on the device a deletion was made on, as it did before.
--
-- Safe to run against an existing database: it creates ONE new table, with
-- its policy and trigger, and touches nothing else. No ALTER on an existing
-- table, no DROP, no data migration. Re-runnable: every statement is
-- `if not exists` or checks first. Needs 014 (the deletions log) applied,
-- for the trigger's function.
--
-- ── What a row is ──
--
-- One deletion: everything a delete took (a transaction, or a plan's months,
-- a split's legs, a purchase's refunds - each as it was) and what it did to
-- debts, so any device can put all of it back. See db/trash.js. It is never
-- edited - only created, and deleted when it is put back, deleted for good,
-- or thirty days old.
--
-- The entry is stored whole, as jsonb, rather than as columns: it is a
-- snapshot the app reads back as one piece, never a record anything queries
-- inside. Local row numbers are taken out before it is sent (trashToRow), so
-- it means the same thing on every device.

create table if not exists public.trash (
  id          uuid not null default gen_random_uuid (),
  user_id     uuid not null,

  -- The stable identity every synced table carries (011). The push resolves
  -- conflicts on (user_id, sync_id). No local_id: a deletion has its sync_id
  -- from the moment it is made.
  sync_id     uuid null,

  -- When it was deleted. Thirty days after this, it goes for good.
  deleted_at  timestamp with time zone not null,

  -- {"txs": [...], "debts": [...], "unhooked": [...], "paid": [...]}
  entry       jsonb not null default '{}'::jsonb,

  created_at  timestamp with time zone null default now(),
  -- Sent by the client, which compares it to decide which copy is newer.
  updated_at  timestamp with time zone null,

  constraint trash_pkey primary key (id),
  constraint trash_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

-- The conflict target of the trash push, 'user_id,sync_id'.
create unique index if not exists trash_user_sync_id_key
  on public.trash (user_id, sync_id);

create index if not exists trash_user_id_idx on public.trash (user_id);

-- ── Row-level security ──────────────────────────────────────────────────────
-- Not optional: the client reaches PostgREST with the public anon key, so
-- this policy is the only thing keeping one person's rows from another's.

alter table public.trash enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'trash'
      and policyname = 'trash: own rows only'
  ) then
    create policy "trash: own rows only"
      on public.trash for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- ── Deletions ───────────────────────────────────────────────────────────────
-- Put back or deleted for good on one device, a row is deleted here - and
-- the trigger from 014 leaves a tombstone, so every other device drops its
-- copy on the next pull instead of offering to put it back a second time.

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trash_record_deletion'
      and tgrelid = 'public.trash'::regclass
  ) then
    create trigger trash_record_deletion
      after delete on public.trash
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
--   where c.relname = 'trash' and c.relnamespace = 'public'::regnamespace;
