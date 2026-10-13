-- 034 — Reports and ideas, sent from the app to the person who makes it.
--
-- ── Why ──
--
-- "Report a problem" used to put a report together and hand it to the share
-- sheet, to be pasted into a message - so a bug found on someone else's phone
-- reached the developer only if they also knew where to send it, and an idea
-- had nowhere to go at all. Now Settings › Report a bug sends it here, and the
-- developer reads every one in their own Settings (src/pages/settings/
-- Feedback.jsx).
--
-- ── What a row holds ──
--
--   kind         'bug', 'idea' or 'other'
--   message      what the person wrote
--   app_version  the version it was sent from
--   device       what it was sent from: phone or computer, the Home Screen app
--                or a browser, the platform, the screen, the browser's own
--                description of itself
--   error_log    the errors Spendr noticed on that device (src/lib/crashLog.js),
--                only when the person chose to send them with a bug
--   sender_email, sender_name
--                who sent it, so it can be answered. Filled in here, from the
--                account, never taken from the app.
--   status       'new' until the developer marks it done
--
-- Never any of the money: no transaction, account or balance is sent with a
-- report, and nothing here reads one.
--
-- ── Who can do what ──
--
--   anyone signed in   send one, as themselves, and read back their own
--   the developer      read every one, mark them done, delete them
--
-- The developer is the account the app already treats as the developer's
-- (src/lib/developer.js DEVELOPER_EMAIL): is_spendr_developer() reads the
-- address on the signed-in session's token. Change both together.
--
-- Ten an hour from one account at most: the trigger turns the eleventh away,
-- so a stuck button or a script cannot fill the inbox.
--
-- Not synced, not in backups, not in the realtime publication and not in
-- row_history: it is mail, not the ledger.
--
-- Safe to run twice.

create table if not exists public.feedback (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('bug', 'idea', 'other')),
  message       text not null check (char_length(btrim(message)) between 1 and 5000),
  app_version   text check (app_version is null or char_length(app_version) <= 40),
  device        jsonb check (device is null or octet_length(device::text) <= 4000),
  error_log     jsonb check (error_log is null or octet_length(error_log::text) <= 60000),
  sender_email  text,
  sender_name   text,
  status        text not null default 'new' check (status in ('new', 'done')),
  created_at    timestamptz not null default now(),
  done_at       timestamptz
);

create index if not exists feedback_status_created_idx on public.feedback (status, created_at desc);
create index if not exists feedback_user_created_idx on public.feedback (user_id, created_at desc);

alter table public.feedback enable row level security;

-- Whether the signed-in account is the developer's. See the note above.
create or replace function public.is_spendr_developer()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(lower(auth.jwt() ->> 'email') = 'sablayjames@gmail.com', false)
$$;

drop policy if exists "feedback: send your own" on public.feedback;
create policy "feedback: send your own"
  on public.feedback for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "feedback: read your own, or all as the developer" on public.feedback;
create policy "feedback: read your own, or all as the developer"
  on public.feedback for select to authenticated
  using (auth.uid() = user_id or public.is_spendr_developer());

drop policy if exists "feedback: the developer files them" on public.feedback;
create policy "feedback: the developer files them"
  on public.feedback for update to authenticated
  using (public.is_spendr_developer())
  with check (public.is_spendr_developer());

drop policy if exists "feedback: the developer deletes them" on public.feedback;
create policy "feedback: the developer deletes them"
  on public.feedback for delete to authenticated
  using (public.is_spendr_developer());

-- Who sent it, from the account rather than the app; a new row is new; and
-- the rate limit. Security definer to read auth.users, search_path pinned, as
-- 014's record_deletion is.
create or replace function public.feedback_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  new.user_id := coalesce(auth.uid(), new.user_id);
  new.status := 'new';
  new.done_at := null;
  new.created_at := now();

  select u.email,
         coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')
    into new.sender_email, new.sender_name
    from auth.users u
   where u.id = new.user_id;

  select count(*) into recent
    from public.feedback f
   where f.user_id = new.user_id
     and f.created_at > now() - interval '1 hour';
  if recent >= 10 then
    raise exception 'feedback rate limit: ten an hour' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- A trigger function is not an API (see 026).
revoke execute on function public.feedback_stamp() from public, anon, authenticated;

drop trigger if exists feedback_stamp on public.feedback;
create trigger feedback_stamp
  before insert on public.feedback
  for each row execute function public.feedback_stamp();
