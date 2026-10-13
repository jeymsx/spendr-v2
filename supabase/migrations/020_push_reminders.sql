-- 020: push reminders - card due dates and bills, delivered while the app is
-- closed.
--
-- ── Why a server is involved at all ──
--
-- An iPhone will not let a web app schedule a notification for later. Once
-- the app is closed, the only way to show one is a push message from a
-- server. So this adds the smallest server there can be:
--
--   push_subscriptions  where each device that turned reminders on can be
--                       reached (the browser's push address and its keys)
--   reminders           what to say, and when - worked out ON THE PHONE from
--                       the ledger and uploaded as text (lib/reminders.js)
--   a cron job          every 15 minutes, asks the send-reminders edge
--                       function to send whatever has come due
--
-- The server never reads a transaction or an account. It only sends the
-- reminders the phone already wrote.
--
-- ── Run once ──
--
-- Every statement is safe to run again, but the secret it creates is only
-- created the first time, and the last statement prints it: copy that value
-- into Edge Functions > Secrets as CRON_SECRET.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.push_subscriptions (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table if not exists public.reminders (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Names the reminder for good - card or bill, due date, which one - so the
  -- phone can upload the same list twice without duplicating anything.
  tag        text not null,
  fire_at    timestamptz not null,
  title      text not null,
  body       text not null,
  url        text not null default '/',
  -- Set by the edge function the moment it claims the row.
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, tag)
);

-- What the cron job asks for every 15 minutes: unsent, and due.
create index if not exists reminders_due on public.reminders (fire_at) where sent_at is null;

-- ── Row-level security: each user sees only their own rows ──────────────────
-- The edge function uses the service role, which bypasses these.

alter table public.push_subscriptions enable row level security;
alter table public.reminders enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'own rows') then
    create policy "own rows" on public.push_subscriptions
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'reminders' and policyname = 'own rows') then
    create policy "own rows" on public.reminders
      for all to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

-- ── The schedule ────────────────────────────────────────────────────────────

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- A random secret the cron job sends and the edge function checks, so only
-- this schedule can make it send. Kept in the vault rather than written into
-- the job itself.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'spendr_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'spendr_cron_secret',
      'Checked by the send-reminders edge function as CRON_SECRET'
    );
  end if;
end $$;

-- Scheduling a name that already exists replaces it.
select cron.schedule(
  'spendr-send-reminders',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://edsxieulenqxrtzuvcdq.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'spendr_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

-- Copy this value into Edge Functions > Secrets, as CRON_SECRET.
select decrypted_secret as cron_secret from vault.decrypted_secrets where name = 'spendr_cron_secret';
