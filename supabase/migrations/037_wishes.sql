-- 037 - The wishlist: things you want, parked to cool off before you buy.
--
-- One row per wish (src/lib/wishes.js). A wish is not money: it moves no
-- balance and is in no total. It is a price, a name, a day to be asked again
-- (cool_until), and what you decided when that day came:
--
--   status       'waiting' until you decide, then 'bought', 'skipped' (the
--                price counts as kept by waiting) or 'saving' (it became a
--                goal, named by goal_name)
--   decided_at   when you decided
--   tx_id        the expense it was bought with, when it was bought through
--                Spendr's Add expense
--
-- Synced like the other small tables: identified by sync_id, newest
-- updated_at wins (the client stamps it), deletions reach the other devices
-- through the deletion log, and the stale-update guard (032), the 30-day
-- history (025), the live stream (030), the row cap and size checks (035) and
-- the once-per-query policy (036) apply as they do everywhere else.
--
-- The app works before this runs: the wishlist stays on the device it was
-- made on until it has (the sync step is optional, like 028's folders).
--
-- Safe to run twice.

create table if not exists public.wishes (
  id          uuid not null default gen_random_uuid (),
  user_id     uuid not null,
  sync_id     uuid null,

  name        text not null default '',
  price       numeric not null default 0,
  currency    text null,
  link        text null,
  note        text null,

  -- The day to ask "Still want it?", 'YYYY-MM-DD' in the person's own time.
  cool_until  text null,
  status      text not null default 'waiting',
  decided_at  timestamp with time zone null,
  tx_id       text null,
  goal_name   text null,

  created_at  timestamp with time zone null default now(),
  -- Sent by the client, which compares it to decide which copy is newer.
  updated_at  timestamp with time zone null,

  constraint wishes_pkey primary key (id),
  constraint wishes_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade,
  constraint wishes_status_check check (status in ('waiting', 'bought', 'skipped', 'saving')),
  constraint wishes_size check (
    char_length(name) <= 200
    and (link is null or char_length(link) <= 2000)
    and (note is null or char_length(note) <= 2000)
  )
);

create unique index if not exists wishes_user_sync_id_key on public.wishes (user_id, sync_id);
create index if not exists wishes_user_id_idx on public.wishes (user_id);

-- Who can see a wish: only its owner, asked once per query (036).
alter table public.wishes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'wishes'
                    and policyname = 'wishes: own rows only') then
    create policy "wishes: own rows only"
      on public.wishes for all
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end
$$;

-- A deleted wish reaches the other devices (record_deletion, 019), its last
-- versions are kept for 30 days (record_history, 025), and an older copy
-- cannot overwrite a newer one (skip_stale_update, 032).
drop trigger if exists wishes_record_deletion on public.wishes;
create trigger wishes_record_deletion
  after delete on public.wishes
  for each row execute function public.record_deletion();

drop trigger if exists wishes_record_history on public.wishes;
create trigger wishes_record_history
  after delete or update on public.wishes
  for each row execute function public.record_history();

drop trigger if exists wishes_skip_stale_update on public.wishes;
create trigger wishes_skip_stale_update
  before update on public.wishes
  for each row execute function public.skip_stale_update();

-- At most 1,000 per account, counted once per insert statement (035).
drop trigger if exists wishes_row_cap on public.wishes;
create trigger wishes_row_cap
  after insert on public.wishes
  referencing new table as added
  for each statement execute function public.enforce_row_cap('1000');

-- Heard live on the other devices (030).
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wishes') then
    alter publication supabase_realtime add table public.wishes;
  end if;
end
$$;
