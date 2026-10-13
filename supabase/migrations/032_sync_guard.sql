-- 032 — A stale push can never overwrite a newer row, and three more columns sync.
--
-- ── The lost update ──
--
-- Every table but transactions (and preferences) carries an updated_at that the
-- DEVICE writes, and the app decides which copy of a row is newer by comparing
-- those stamps - on the way down (a pull keeps the newer) and, until now, not
-- at all on the way up: a push is an upsert, and an upsert replaces whatever
-- is there. A device that had been asleep, or offline, or simply had not looked
-- at the cloud for a while, could therefore send its stale copy of a row that
-- another device had changed in the meantime, and win. The older stamp it
-- carried did nothing to stop it. Nothing errored; one device's edit was just
-- gone.
--
-- The app has stopped sending whole tables (a row goes up only when it has
-- changed since it last went - src/lib/sync.js isUnsent), which closes most
-- of that. This closes the rest, in the one place that cannot be raced: the
-- database. A BEFORE UPDATE trigger on each of these tables turns an update
-- into nothing when the incoming updated_at is OLDER than the row's own. An
-- equal stamp goes through (the stable id being written onto a row, a push of
-- a row that did not change), and so does a row with no stamp on either side,
-- which is how every row behaved before this.
--
-- Returning NULL from a BEFORE ROW trigger skips that row's update without an
-- error, including when the update is the DO UPDATE half of an upsert - so the
-- push still succeeds, the newer row stays, and the next pull hands the
-- newer row to the device that was stale.
--
-- ── Which tables, and which not ──
--
--   accounts, categories, debts, recurring, templates, goals, challenges,
--   note_folders               updated_at is written by the client.   Guarded.
--
--   notes                      the same: 027 says "no set_updated_at trigger"
--                              and the app compares the stamps itself. A note
--                              is edited from two devices more than most
--                              things. Guarded.
--
--   badges                     not last-write-wins at all: when two devices
--                              disagree about the day a badge was earned the
--                              EARLIER one is the true one (pullBadges), and
--                              the updated_at a badge is sent with IS its
--                              earned day. A device correcting the cloud to
--                              an earlier day would therefore look stale to
--                              this guard and be refused - the opposite of
--                              what it should do. Left alone.
--
--   transactions               updated_at is written by the server, by 001's
--                              set_updated_at on every update, so a client's
--                              stamp never reaches it. Left alone. (A guard
--                              would only ever compare now() with an older
--                              stamp, and never refuse anything.)
--
--   user_preferences           the same trigger (003). Left alone.
--
--   trash                      a deletion is written once and never edited, so
--                              there is no stale write to turn away.
--
--   deletions                  the log of removals, written by 014's trigger
--                              and never updated.
--
-- Only the tables that exist get a trigger (a migration you have not run is
-- skipped, as in 030), so it does not matter which of 004, 006, 021, 027 and
-- 028 you have applied.
--
-- ── If you ever fix a row by hand ──
--
-- An UPDATE that does not mention updated_at is untouched by this: the row
-- keeps its own stamp, which is not older than itself. One that restores a row
-- from row_history (025) WITH its old updated_at is older than the row it is
-- replacing, and is skipped without a word. Leave updated_at out of the SET, or
-- set it to now(), or pause the guard for the statement:
--
--   alter table public.accounts disable trigger accounts_skip_stale_update;
--   ... your update ...
--   alter table public.accounts enable trigger accounts_skip_stale_update;
--
-- ── Three columns the app has been keeping to itself ──
--
--   categories.rollover       true or false: this category carries its unspent
--                             budget into the next month, or does not; null is
--                             "follow the setting for all categories".
--   categories.rollover_from  the month it started carrying from, 'YYYY-MM'.
--                             Both existed on the device and never reached the
--                             cloud, so a second device read every category
--                             as following the general setting.
--   recurring.due_day         the day of the month a monthly, quarterly or
--                             yearly bill falls on, 1 to 31, so a bill due on
--                             the 31st stays there instead of sliding to the
--                             28th the first time a short month rolls it
--                             forward. Null for a bill with none, which is
--                             every row until it is next saved.
--
-- All three are nullable with no default, so nothing existing is rewritten.
-- The app works without them (lib/sync.js OPTIONAL_COLS drops them from a push
-- and retries), they just stay on the device that set them until this runs.
--
-- Safe to run twice: the function is replaced, each trigger is dropped and made
-- again, and every column is `add column if not exists`. Changes no row.

create or replace function public.skip_stale_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Strictly older only. A null on either side compares as unknown, which is
  -- not true, so a row with no stamp is let through.
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

-- A trigger function is not an API (see 026): PostgREST would otherwise offer
-- it at /rest/v1/rpc/. Triggers do not check EXECUTE when they fire, so this
-- changes nothing about what it guards.
revoke execute on function public.skip_stale_update() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'debts', 'recurring', 'templates',
    'goals', 'challenges', 'note_folders', 'notes'
  ]
  loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_skip_stale_update', t);
      execute format(
        'create trigger %I before update on public.%I
           for each row execute function public.skip_stale_update()',
        t || '_skip_stale_update', t
      );
    end if;
  end loop;
end
$$;

alter table public.categories
  add column if not exists rollover boolean,
  add column if not exists rollover_from text;

alter table public.recurring
  add column if not exists due_day smallint;

-- Check (read-only): expect one trigger for each of these tables you have, and
-- the three columns.
-- select event_object_table, trigger_name
--   from information_schema.triggers
--  where trigger_name like '%_skip_stale_update'
--  order by 1;
-- select table_name, column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public'
--    and (table_name, column_name) in (
--      ('categories', 'rollover'), ('categories', 'rollover_from'), ('recurring', 'due_day')
--    )
--  order by 1, 2;
