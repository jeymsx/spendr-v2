-- 025 — Every change keeps what it replaced, for thirty days.
--
-- ── Why ──
--
-- 2026-09-28: a laptop fresh out of setup signed in, the sync took its
-- just-made rows for the newest data, and three balances and every budget
-- limit were overwritten on the server. The free plan keeps no backups, so
-- putting them back meant rebuilding each balance from a two-week-old backup
-- file plus every transaction since. The sync no longer does that (see
-- src/lib/firstSync.js), but the next surprise will be a different one.
--
-- With this, an UPDATE or DELETE on any synced table first copies the row as
-- it was into row_history. Undoing a bad sync becomes a query: "these rows as
-- they were before 15:17".
--
-- ── What it costs ──
--
-- The app re-sends every account and category on every sync, and those
-- updates change nothing. A history of them would be all noise, so an update
-- that leaves the row as it was - updated_at aside, which the server stamps
-- on transactions every time - is not recorded. What is left is real edits.
-- Versions older than thirty days are pruned as new ones arrive, a few at a
-- time, so the table stays small without a scheduled job.
--
-- ── Who can see it ──
--
-- Only you, your own rows: RLS allows reading and nothing else. Rows are
-- written by the trigger (security definer, search_path pinned, as 014's
-- record_deletion is), carrying the user_id of the row that changed, so it
-- cannot write history for anybody else. The server still never reads a
-- transaction: this is a copy, kept where the original already was.
--
-- ── Also: the forecast's settings travel ──
--
-- Two nullable columns on user_preferences, so the Forecast settings and the
-- floor set on the phone are the ones on the laptop too. The app works
-- without them (lib/sync.js OPTIONAL_COLS), they just stay on each device.
--
-- Needs 003 and 014. Safe to run twice.

create table if not exists public.row_history (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  table_name  text not null,
  row_id      text,            -- the row's own id, when it has one
  row_key     text,            -- its stable id: tx_id or sync_id
  op          text not null check (op in ('UPDATE', 'DELETE')),
  old_row     jsonb not null,  -- the whole row, as it was
  changed_at  timestamptz not null default now()
);

alter table public.row_history enable row level security;

drop policy if exists "row_history: read own rows" on public.row_history;
create policy "row_history: read own rows"
  on public.row_history for select
  using (auth.uid() = user_id);

create index if not exists row_history_user_time_idx
  on public.row_history (user_id, changed_at);
create index if not exists row_history_row_idx
  on public.row_history (user_id, table_name, row_key, changed_at desc);

create or replace function public.record_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  was jsonb := to_jsonb(old);
begin
  -- An update that changes nothing but its stamp is not a change.
  if tg_op = 'UPDATE' and (was - 'updated_at') = (to_jsonb(new) - 'updated_at') then
    return new;
  end if;

  insert into public.row_history (user_id, table_name, row_id, row_key, op, old_row)
  values (
    old.user_id, tg_table_name, was ->> 'id',
    coalesce(was ->> 'tx_id', was ->> 'sync_id'), tg_op, was
  );

  -- Thirty days is long enough to notice. Older versions go as new ones come.
  delete from public.row_history
   where id in (
     select id from public.row_history
      where user_id = old.user_id and changed_at < now() - interval '30 days'
      order by changed_at
      limit 50
   );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'transactions', 'accounts', 'categories', 'debts', 'recurring',
    'templates', 'goals', 'user_preferences'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_record_history', t);
    execute format(
      'create trigger %I after update or delete on public.%I
         for each row execute function public.record_history()',
      t || '_record_history', t
    );
  end loop;
end;
$$;

alter table public.user_preferences
  add column if not exists forecast_settings jsonb,
  add column if not exists forecast_floor numeric;

-- ── Using it ──
--
-- Every version of an account, newest first:
--   select changed_at, op, old_row ->> 'balance' as balance
--     from public.row_history
--    where table_name = 'accounts' and old_row ->> 'name' = 'Cash'
--    order by changed_at desc;
--
-- The budget limits as they were before a given moment:
--   select distinct on (row_key) old_row ->> 'name' as name, old_row ->> 'budget' as budget
--     from public.row_history
--    where table_name = 'categories' and changed_at >= '2026-09-28 15:17+00'
--    order by row_key, changed_at;
--
-- Check (read-only): expect eight triggers and the two new columns.
-- select event_object_table, trigger_name from information_schema.triggers
--  where trigger_name like '%_record_history' order by 1;
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'user_preferences'
--    and column_name in ('forecast_settings', 'forecast_floor');
