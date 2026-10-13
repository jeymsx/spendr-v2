-- 019: what arrived at the other end of a transfer between two currencies.
--
-- ── The bug ──
--
-- A transfer had one amount. The source lost it and the destination gained
-- it, so $100 sent from a dollar account to a peso account put P100 into the
-- peso account instead of about P5,800.
--
-- ── The fix ──
--
-- `amount` keeps meaning what LEFT the source, in the source's currency.
-- These two say what ARRIVED, and in which currency, because a bank converts
-- at its own rate and the app can only estimate it.
--
-- ── Nothing is backfilled ──
--
-- Both are nullable, and null means "the destination moved by `amount`" -
-- which is exactly what happened to every row already here, so reversing an
-- old transfer still takes off what it put on. A same-currency transfer, which
-- is nearly all of them, never sets them.
--
-- Purely additive: no existing column is touched and no row is rewritten.
-- The app drops both columns and retries if they are missing (OPTIONAL_COLS
-- in lib/sync.js), so it keeps syncing whether this has run or not.

alter table public.transactions
  add column if not exists to_amount numeric,
  add column if not exists to_currency text;

comment on column public.transactions.to_amount is
  'Transfers between two currencies only: what arrived, in to_currency. Null means the destination received amount.';
comment on column public.transactions.to_currency is
  'ISO code to_amount is in. Null when to_amount is.';
