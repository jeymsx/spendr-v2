-- 028 — Folders and tags for notes.
--
-- Syncs how your notes are filed between your devices: which folder a note is
-- in, the tags on it, and the folders themselves. Until it is applied,
-- lib/sync.js leaves both out of a note's push and steps over the folders
-- (see OPTIONAL_COLS and optionalSync), and everything else keeps syncing -
-- notes just stay filed and tagged only on the device that did it.
--
-- Safe to run against an existing database: it creates ONE new table, with
-- its policy and two triggers, and adds two columns to notes - both nullable
-- or defaulted, so no existing row changes. No DROP, no data migration.
-- Re-runnable: every statement is `if not exists` or checks first. Needs 027
-- (notes), 014 (the deletions log) and 025 (row history) applied.
--
-- ── What a row is ──
--
-- note_folders: one folder, its name. A note names the folder it is in by the
-- folder's sync_id (notes.folder_sync_id), not by a row id - the same on every
-- device - and there is deliberately no foreign key: a note pulled before its
-- folder, or one whose folder was deleted on another device a moment ago,
-- must not be refused. The app treats a folder it cannot find as none.
--
-- notes.tags: the note's tags as a list of lower-case words, without the #.
--
-- ── Who can see it ──
--
-- Only you: RLS keeps every row to its owner, as on every other table.

create table if not exists public.note_folders (
  id          uuid not null default gen_random_uuid (),
  user_id     uuid not null,

  -- The stable identity every synced table carries (011). The push resolves
  -- conflicts on (user_id, sync_id).
  sync_id     uuid null,

  name        text not null default '',

  created_at  timestamp with time zone null default now(),
  -- Sent by the client, which compares it to decide which copy is newer.
  updated_at  timestamp with time zone null,

  constraint note_folders_pkey primary key (id),
  constraint note_folders_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade
);

-- The conflict target of the folders push, 'user_id,sync_id'.
create unique index if not exists note_folders_user_sync_id_key
  on public.note_folders (user_id, sync_id);

create index if not exists note_folders_user_id_idx on public.note_folders (user_id);

-- ── Notes: where it is filed, and its tags ──────────────────────────────────

alter table public.notes
  add column if not exists folder_sync_id uuid null,
  add column if not exists tags text[] not null default '{}';

-- ── Row-level security ──────────────────────────────────────────────────────
-- Not optional: the client reaches PostgREST with the public anon key, so
-- this policy is the only thing keeping one person's rows from another's.

alter table public.note_folders enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'note_folders'
      and policyname = 'note_folders: own rows only'
  ) then
    create policy "note_folders: own rows only"
      on public.note_folders for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- ── Deletions ───────────────────────────────────────────────────────────────
-- Deleted on one device, a folder is deleted here - and the trigger from 014
-- leaves a tombstone, so every other device drops its copy on the next pull
-- instead of pushing it straight back. The tombstone names the table, which
-- is why the app's own table has this name too.

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'note_folders_record_deletion'
      and tgrelid = 'public.note_folders'::regclass
  ) then
    create trigger note_folders_record_deletion
      after delete on public.note_folders
      for each row execute function public.record_deletion();
  end if;
end $$;

-- ── History ─────────────────────────────────────────────────────────────────
-- As every synced table does since 025.

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'note_folders_record_history'
      and tgrelid = 'public.note_folders'::regclass
  ) then
    create trigger note_folders_record_history
      after update or delete on public.note_folders
      for each row execute function public.record_history();
  end if;
end $$;

-- ── Check it applied ────────────────────────────────────────────────────────
-- Read-only. Should list note_folders with RLS on, one policy and two
-- triggers, and then the two new columns of notes:
--
--   select c.relname, c.relrowsecurity,
--          (select count(*) from pg_policies p where p.tablename = c.relname) as policies,
--          (select count(*) from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal) as triggers
--   from pg_class c
--   where c.relname = 'note_folders' and c.relnamespace = 'public'::regnamespace;
--
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'notes'
--     and column_name in ('folder_sync_id', 'tags');
