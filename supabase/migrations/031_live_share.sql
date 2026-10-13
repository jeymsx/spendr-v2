-- 031 — Your devices tell each other about a transaction the moment it is saved.
--
-- Migration 030 let the database announce changes. That is a longer way round:
-- the phone sends the row, the database stores it, and only then does the
-- laptop hear. This lets the phone tell the laptop directly, over the
-- connection both already keep open (Supabase Realtime Broadcast), and the
-- laptop shows the transaction as the message arrives. The database still gets
-- the row the usual way, so nothing depends on this: without it the app works
-- as it did after 030, a moment slower (src/lib/liveShare.js).
--
-- A transaction is money, so the channel is private and it is yours alone. The
-- channel is named after the user (spendr:live:<your id>), and these two
-- policies let a signed-in user receive on, and send to, that one channel and
-- no other. Nobody holding the project's public key can listen in.
--
-- It stores nothing: Realtime checks the policies when a device joins and
-- rolls the check back. It changes no data and none of your tables.
--
-- Safe to run twice: each policy is dropped and made again.

drop policy if exists "spendr: hear your own devices" on realtime.messages;
create policy "spendr: hear your own devices"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) = ('spendr:live:' || (select auth.uid())::text)
);

drop policy if exists "spendr: tell your own devices" on realtime.messages;
create policy "spendr: tell your own devices"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) = ('spendr:live:' || (select auth.uid())::text)
);

-- Check (read-only): expect the two policies above.
-- select policyname, cmd
-- from pg_policies
-- where schemaname = 'realtime' and tablename = 'messages' and policyname like 'spendr:%';
