-- 017 — A charge remembers which bill wrote it, portably.
--
-- ── What was broken ──
--
-- postRecurringCharge stamped each transaction with `recurringId`, and the
-- bill's page listed its history by matching that against its own id. Two
-- problems, and the second is the bad one.
--
--   recurringId is a LOCAL Dexie id, so deleting a bill and re-creating it
--   gives the new one a different id and an empty history, even though every
--   charge is still in the ledger.
--
--   recurringId is never sent to Supabase at all. So on any device that
--   received its transactions from a pull - a new phone, a reinstall, a
--   restore - EVERY bill shows no history, because the charges arrived
--   without the field. The data was never wrong; the link simply did not
--   travel.
--
-- recurring_sync_id carries the bill's STABLE id (011) instead, so the link
-- survives a re-creation, a restore, and a second device.
--
-- ── The rows that already exist ──
--
-- A year of charges carry no such value and never will. The bill page falls
-- back to matching on the description, which postRecurringCharge sets to the
-- bill's name - tight enough in practice, and the alternative is a history
-- that stays empty for everything logged before today.
--
-- Additive and nullable; OPTIONAL_COLS drops it and retries if this has not
-- been run, so a client ahead of the database still syncs.

alter table public.transactions
  add column if not exists recurring_sync_id text;

create index if not exists transactions_recurring_sync_idx
  on public.transactions (user_id, recurring_sync_id)
  where recurring_sync_id is not null;
