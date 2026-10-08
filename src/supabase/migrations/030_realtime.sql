-- 030 — Live updates between your devices.
--
-- Supabase Realtime streams a table's changes to connected clients, but only
-- for tables in the `supabase_realtime` publication. This puts every table the
-- app syncs in it, so a change made on one device - a transaction, a budget, a
-- preference, a deletion - is heard by the others as it happens instead of at
-- their next sync (src/lib/realtime.js).
--
-- It changes no data and no policy: Realtime honours the row-level security
-- you already have, so a device is only ever told about its own user's rows.
-- Deletions arrive through the `deletions` table (014), which gets a row for
-- every delete - the stream cannot filter a DELETE to one person, an INSERT it
-- can.
--
-- Until it is applied, the app still syncs as it did and asks the cloud for
-- changes every 45 seconds while its window is in front.
--
-- Safe to run twice: a table already in the publication is left alone, and a
-- table that does not exist yet (a migration you have not run) is skipped.

do $$
declare
  t text;
begin
  -- Supabase creates this publication with the project; this is for a database
  -- that somehow has not got one.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'transactions', 'accounts', 'categories', 'debts', 'recurring', 'templates',
    'goals', 'badges', 'challenges', 'trash', 'note_folders', 'notes',
    'user_preferences', 'deletions'
  ]
  loop
    if to_regclass('public.' || quote_ident(t)) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       )
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- Check (read-only): expect one row for each table you have.
-- select tablename
-- from pg_publication_tables
-- where pubname = 'supabase_realtime' and schemaname = 'public'
-- order by tablename;
