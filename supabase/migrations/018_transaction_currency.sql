-- 018: what a transaction's amount is IN, and what it was worth in the
-- ledger's own currency on the day it happened.
--
-- ── Why this is stored and not derived ──
--
-- A balance is a present-tense fact and converts at today's rate: what the
-- dollar account is worth right now really does change when the rate does.
--
-- A transaction is a past fact. $40 spent in March was a particular number of
-- pesos in March, and re-deriving it at today's rate would rewrite last
-- quarter's spending every morning - so a month you had already closed would
-- never sit still. The conversion happens once, on the day, and is stored.
--
-- ── Nothing is backfilled ──
--
-- All three are nullable, and null means "the ledger's own currency, at
-- parity". That is true of every one of the 1,137 rows already here and of
-- every row any single-currency ledger will ever write, so there is nothing
-- to backfill and no migration window in which a figure is wrong.
--
-- Applied 2026-09-16 against the live project. Purely additive DDL; no
-- existing column is touched and no row is rewritten.

alter table public.transactions
  -- What `amount` is denominated in: the account's currency when the row was
  -- written. Null = the ledger's base currency.
  add column if not exists currency text,
  -- `amount` converted, at the rate on transaction_date.
  add column if not exists base_amount numeric,
  -- Which currency base_amount is in. Stored rather than assumed, so that
  -- somebody who later changes their ledger's currency can be told their
  -- older rows were priced against a different one, instead of having those
  -- figures silently reinterpreted.
  add column if not exists base_currency text;

comment on column public.transactions.currency is
  'ISO code the amount is in. Null means the ledger base currency.';
comment on column public.transactions.base_amount is
  'amount converted to base_currency at the rate on transaction_date. Null means equal to amount.';
comment on column public.transactions.base_currency is
  'ISO code base_amount is quoted in.';
