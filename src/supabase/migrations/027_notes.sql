-- 027 — Notes.
--
-- Syncs Notes between your devices. Until it is applied, lib/sync.js steps
-- over the notes push and pull (see optionalSync) and everything else keeps
-- syncing — notes just stay on the device they were written on.
--
-- Safe to run against an existing database: it creates ONE new table, with
-- its policy and two triggers, and touches nothing else. No ALTER on an
-- existing table, no DROP, no data migration. Re-runnable: every statement is
-- `if not exists` or checks first. Needs 014 (the deletions log) and 025 (row
-- history) applied, for the triggers' functions.
--
-- ── What a row is ──
--
-- One note: its body as the editor's own document (ProseMirror JSON), stored
-- whole as jsonb - it is read back as one piece, never queried inside - and
-- its title beside it, only so the table reads sensibly here. A device works
-- the title out from the document itself (lib/sync.js rowToNote).
--
-- `deleted_at` is Recently deleted: set, the note waits there for thirty days
-- on every device. Deleting it from there deletes the row, and 014's trigger
-- leaves the tombstone that removes it everywhere else.
--
-- ── Who can see it ──
--
-- Only you: RLS keeps every row to its owner, as on every other table. The
-- app never reads anyone's notes but your own.

create table if not exists public.notes (
  id          uuid not null default gen_random_uuid (),
  user_id     uuid not null,

  -- The stable identity every synced table carries (011). The push resolves
  -- conflicts on (user_id, sync_id). No local_id: a note has its sync_id from
  -- the moment it is made.
  sync_id     uuid null,

  -- Its first line, for reading the table. Not what the app shows.
  title       text not null default '',
  -- The document: {"type": "doc", "content": [...]}.
  content     jsonb not null default '{}'::jsonb,
  pinned      boolean not null default false,

  created_at  timestamp with time zone null default now(),
  -- When its words last changed: what the list shows and sorts by. Pinning a
  -- note moves updated_at, not this.
  edited_at   timestamp with time zone null,
  -- In Recently deleted since; null when it is not.
  deleted_at  timestamp with time zone null,
  -- Sent by the client, which compares it to decide which copy is newer.
  -- No set_updated_at trigger, as with every table but transactions.
  updated_at  timestamp with time zone null,

  constraint notes_pkey primary key (id),
  constraint notes_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

-- The conflict target of the notes push, 'user_id,sync_id'.
create unique index if not exists notes_user_sync_id_key
  on public.notes (user_id, sync_id);

create index if not exists notes_user_id_idx on public.notes (user_id);

-- ── Row-level security ──────────────────────────────────────────────────────
-- Not optional: the client reaches PostgREST with the public anon key, so
-- this policy is the only thing keeping one person's rows from another's.

alter table public.notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'notes'
      and policyname = 'notes: own rows only'
  ) then
    create policy "notes: own rows only"
      on public.notes for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- ── Deletions ───────────────────────────────────────────────────────────────
-- Deleted for good on one device, a row is deleted here - and the trigger
-- from 014 leaves a tombstone, so every other device drops its copy on the
-- next pull instead of pushing it straight back.

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'notes_record_deletion'
      and tgrelid = 'public.notes'::regclass
  ) then
    create trigger notes_record_deletion
      after delete on public.notes
      for each row execute function public.record_deletion();
  end if;
end $$;

-- ── History ─────────────────────────────────────────────────────────────────
-- As every synced table does since 025: an edit or a delete keeps the row it
-- replaced for thirty days, so a note written over by a stale device can be
-- read back.

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'notes_record_history'
      and tgrelid = 'public.notes'::regclass
  ) then
    create trigger notes_record_history
      after update or delete on public.notes
      for each row execute function public.record_history();
  end if;
end $$;

-- ── Check it applied ────────────────────────────────────────────────────────
-- Read-only. Should list the table with RLS on, one policy and two triggers:
--
--   select c.relname, c.relrowsecurity,
--          (select count(*) from pg_policies p where p.tablename = c.relname) as policies,
--          (select count(*) from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal) as triggers
--   from pg_class c
--   where c.relname = 'notes' and c.relnamespace = 'public'::regnamespace;
