-- 035 — Ready for people other than us: deleting your own account, limits a
-- stranger cannot get around, two sync gaps closed in the database, a sturdier
-- developer check, and two warnings from the security advisor.
--
-- ── 1. Delete my account ──
--
-- The privacy policy used to say "email jamesandgen111@gmail.com and it will be
-- deleted". Somebody you have never met should not have to ask, and both app
-- stores require it to be in the app. delete_my_account() removes the signed-in
-- account and everything it owns, at once and for good: the sign-in itself
-- (auth.users), and with it every row of every table here, because each one
-- references auth.users ON DELETE CASCADE. Latr's `jobs` (the sibling app that
-- shares this project) does not cascade, so its rows go first by hand.
--
-- Security definer, because deleting from auth.users needs the owner's rights;
-- it only ever deletes auth.uid(), the account calling it, so nobody can delete
-- anyone else. Not callable signed out.
--
-- ── 2. Limits ──
--
-- Anyone with a Google account can sign in, and row-level security keeps each
-- person to their own rows - but nothing stopped one account writing a million
-- of them, or a 20 MB photo into a QR field, until the free plan's 500 MB was
-- gone for everybody. So:
--
--   sizes   checked on every new write (NOT VALID: rows already here are not
--           re-checked), far above anything real - the largest QR photo today
--           is 113 KB, the longest description 39 characters:
--             an account's QR photo     600 KB
--             a description             10,000 characters
--             a note's content          1 MB, its title 1,000 characters
--             a deletion in Recently deleted   2 MB
--
--   counts  per account, checked once per insert statement (not per row, so an
--           import of a thousand rows counts once), far above real use - the
--           largest ledger today is 1,112 transactions:
--             transactions 200,000   notes 10,000    trash 20,000
--             debts 10,000           categories 1,000  recurring 1,000
--             templates 1,000        challenges 2,000  accounts 500
--             goals 500              note folders 500
--
-- A write over a limit is refused with "Spendr limit: ...", which the app's
-- sync shows as a failed sync rather than losing anything on the device.
--
-- ── 3. A transaction is stamped when it arrives, not only when it changes ──
--
-- 001's set_updated_at ran BEFORE UPDATE only, so a new row kept the
-- updated_at the device sent - the moment it was saved. Every device reads the
-- ledger as "rows newer than the newest I have seen" (src/lib/sync.js
-- pullTxs), so a transaction saved offline, sent later with its earlier time,
-- fell behind what the others had already read, and they never fetched it:
-- its balance was short by the row on every other device, for good. A device
-- whose clock ran ahead did the opposite, and its future stamps pushed the
-- others' reading point past rows still to come. Stamped by the database on
-- the way in as well, the time is always the cloud's, and always later than
-- anything already read. (The app reads the whole ledger again once after
-- this, to fetch anything already missed.)
--
-- ── 4. Which due date a bill's charge paid ──
--
-- transactions.recurring_prev_date: the due date a charge posted from a bill
-- paid. It was kept on the device that paid it and never sent, so no other
-- device could tell a due date was paid - a bill sent back by an older copy
-- showed as due beside its own charge, and could be paid twice. Nullable text
-- ('YYYY-MM-DD'), so nothing existing is rewritten; the app works without it
-- (OPTIONAL_COLS).
--
-- ── 5. Who the developer is ──
--
-- 034's is_spendr_developer() read the email on the session's token. Google
-- verifies it and auth.users keeps addresses unique, but an account's id is
-- the one thing nobody can change, so that is what it checks now: the account
-- signed in as sablayjames@gmail.com. If that account is ever deleted and made
-- again it gets a new id, and this needs the new one (and lib/developer.js its
-- address, which the app still uses to decide what to show).
--
-- ── 6. The advisor ──
--
-- set_updated_at (001) and update_updated_at (Latr's) had a mutable
-- search_path. Both only stamp now(), which pg_catalog always provides.
--
-- Safe to run twice.

-- ── 1 ──

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- Latr's rows do not cascade (jobs_user_id_fkey is NO ACTION).
  if to_regclass('public.jobs') is not null then
    delete from public.jobs where user_id = me;
  end if;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ── 2 ── sizes

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_qr_image_size') then
    alter table public.accounts add constraint accounts_qr_image_size
      check (qr_image is null or octet_length(qr_image) <= 600000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_description_size') then
    alter table public.transactions add constraint transactions_description_size
      check (description is null or char_length(description) <= 10000) not valid;
  end if;
  if to_regclass('public.notes') is not null
     and not exists (select 1 from pg_constraint where conname = 'notes_content_size') then
    alter table public.notes add constraint notes_content_size
      check ((content is null or octet_length(content::text) <= 1000000)
             and (title is null or char_length(title) <= 1000)) not valid;
  end if;
  if to_regclass('public.trash') is not null
     and not exists (select 1 from pg_constraint where conname = 'trash_entry_size') then
    alter table public.trash add constraint trash_entry_size
      check (octet_length(entry::text) <= 2000000) not valid;
  end if;
end
$$;

-- ── 2 ── counts

create or replace function public.enforce_row_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cap bigint := tg_argv[0]::bigint;
  over uuid;
begin
  -- `added` is this statement's inserted rows; each account in it is counted once.
  execute format(
    'select a.user_id from (select distinct user_id from added) a
      where (select count(*) from %I.%I t where t.user_id = a.user_id) > $1
      limit 1',
    tg_table_schema, tg_table_name)
  into over using cap;
  if over is not null then
    raise exception 'Spendr limit: % rows in %', cap, tg_table_name using errcode = 'P0001';
  end if;
  return null;
end;
$$;

-- A trigger function is not an API (see 026).
revoke execute on function public.enforce_row_cap() from public, anon, authenticated;

do $$
declare
  caps constant jsonb := '{
    "transactions": 200000, "notes": 10000, "trash": 20000, "debts": 10000,
    "categories": 1000, "recurring": 1000, "templates": 1000, "challenges": 2000,
    "accounts": 500, "goals": 500, "note_folders": 500
  }';
  t text;
begin
  for t in select jsonb_object_keys(caps)
  loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_row_cap', t);
      execute format(
        'create trigger %I after insert on public.%I
           referencing new table as added
           for each statement execute function public.enforce_row_cap(%L)',
        t || '_row_cap', t, caps ->> t);
    end if;
  end loop;
end
$$;

-- ── 3 ──

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before insert or update on public.transactions
  for each row execute function public.set_updated_at();

-- ── 4 ──

alter table public.transactions add column if not exists recurring_prev_date text;

-- ── 5 ──

create or replace function public.is_spendr_developer()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.uid() = '96ecde22-5ec9-40fc-b77b-93ad93f593c7'::uuid, false)
$$;

-- ── 6 ──

alter function public.set_updated_at() set search_path = '';
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'update_updated_at' and p.pronargs = 0) then
    alter function public.update_updated_at() set search_path = '';
  end if;
end
$$;
