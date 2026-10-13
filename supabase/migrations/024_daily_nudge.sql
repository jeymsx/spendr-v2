-- 024 — The daily check-in's time follows you.
--
-- One nullable text column on user_preferences: 'HH:MM' on a quarter hour
-- when the check-in is on, 'off' when it has been switched off, null when it
-- was never set. See src/lib/nudge.js.
--
-- It has to sync, not merely be convenient to. The reminder list is one per
-- person and every signed-in device rebuilds and uploads it whole, deleting
-- what it did not build - so a laptop that did not know about the check-in
-- would delete the phone's next nudge the first time it uploaded.
--
-- Nothing else changes: each day's check-in is one more row in the existing
-- `reminders` table, tagged 'nudge:<date>', sent by the same cron and the same
-- edge function. The server still never reads a transaction.
--
-- Needs 003 (user_preferences). Safe to run twice.

alter table public.user_preferences
  add column if not exists daily_nudge text;

-- Check (read-only): expect one row, data_type text.
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'user_preferences' and column_name = 'daily_nudge';
