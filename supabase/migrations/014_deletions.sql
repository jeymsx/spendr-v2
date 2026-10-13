-- 014 — Tombstones, so a delete travels.
--
-- ── The bug ──
--
-- Delete a transaction on your phone and it goes: removed locally, and the
-- phone tells the server to remove it too. Your laptop then pulls - and the
-- pull only ever ADDS and UPDATES. It has no way to notice that something it
-- already holds is no longer there, so the laptop shows the transaction for
-- ever. Every device that already had the row keeps it.
--
-- A pull cannot infer a deletion from absence, because absence is also what
-- "you already have it" looks like once the pull stops re-reading the whole
-- table. So the deletion has to be a row of its own.
--
-- ── Why a trigger and not client code ──
--
-- The obvious version writes a tombstone next to every delete the client
-- issues. There are seven tables, several delete paths each, a queue that
-- retries them, and cascade deletes that are issued from three different
-- files - and a delete that forgets its tombstone is invisible, because the
-- symptom appears on a DIFFERENT device days later.
--
-- An AFTER DELETE trigger cannot be forgotten. Anything that removes a row -
-- the app, a queued retry, a future feature, a hand-run statement in the SQL
-- editor - records itself, because the recording is part of deleting.
--
-- ── What identifies the row ──
--
-- The stable id, never local_id. transactions carry tx_id and have since the
-- beginning; the other six carry sync_id as of 011. A row with neither is
-- skipped rather than tombstoned under a key no client could match, which
-- means a row deleted before it was ever stamped does not propagate - the
-- same as today, and it stops being possible as 011 finishes landing.

create table if not exists public.deletions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  table_name  text not null,
  row_key     text not null,
  deleted_at  timestamptz not null default now(),

  -- Deleting the same key twice is one fact, not two. The upsert in the
  -- trigger below leans on this.
  unique (user_id, table_name, row_key)
);

alter table public.deletions enable row level security;

create policy "deletions: own rows only"
  on public.deletions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The only query anyone runs: everything this user has deleted since the
-- last time I looked.
create index if not exists deletions_user_since_idx
  on public.deletions (user_id, deleted_at desc);

/*
 * security definer, because RLS on `deletions` is checked against the caller
 * and the caller is deleting a row they own - the insert is on their behalf
 * and carries their user_id from the row itself, so it cannot write a
 * tombstone for anybody else.
 *
 * search_path is pinned. An unpinned one on a definer function is the
 * escalation the linter warns about, and the two existing functions in this
 * database already trip it.
 */
create or replace function public.record_deletion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  rec jsonb := to_jsonb(old);
  key text;
begin
  /* Through jsonb, not old.<column>.
   *
   * One function serves seven tables and they do not share a key column:
   * transactions have tx_id and no sync_id, the other six the reverse. A
   * CASE over old.tx_id / old.sync_id looks like it picks one, and does not -
   * PL/pgSQL resolves every field reference in the expression, so deleting a
   * transaction failed on `record "old" has no field "sync_id"` even though
   * that branch was never taken. It took the whole delete down with it.
   *
   * to_jsonb has no such problem: a missing key is null, not an error. */
  if tg_table_name = 'transactions' then
    key := rec ->> 'tx_id';
  else
    key := rec ->> 'sync_id';
  end if;

  -- Nothing stable to point at. Better silent than a tombstone under a key
  -- no client can match, which would never be applied and never expire.
  if key is null or key = '' then
    return old;
  end if;

  insert into public.deletions (user_id, table_name, row_key)
  values (old.user_id, tg_table_name, key)
  on conflict (user_id, table_name, row_key)
    do update set deleted_at = now();

  return old;
end;
$$;

create trigger transactions_record_deletion
  after delete on public.transactions
  for each row execute function public.record_deletion();

create trigger accounts_record_deletion
  after delete on public.accounts
  for each row execute function public.record_deletion();

create trigger categories_record_deletion
  after delete on public.categories
  for each row execute function public.record_deletion();

create trigger debts_record_deletion
  after delete on public.debts
  for each row execute function public.record_deletion();

create trigger recurring_record_deletion
  after delete on public.recurring
  for each row execute function public.record_deletion();

create trigger templates_record_deletion
  after delete on public.templates
  for each row execute function public.record_deletion();

create trigger goals_record_deletion
  after delete on public.goals
  for each row execute function public.record_deletion();

-- ── Keeping the table small ──
--
-- A tombstone is only useful until every device has seen it. There is no way
-- to know when that is, so this keeps 180 days: a device offline longer than
-- half a year has a bigger problem than a stale row, and the client falls
-- back to a full pull whenever it has no watermark.
--
-- Not scheduled here. Run it by hand or from a cron job; the table is a few
-- rows a month and nothing breaks if it is never run.
--
--   delete from public.deletions where deleted_at < now() - interval '180 days';
