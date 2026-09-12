-- 007 — What a credit card charges for paying late.
--
-- Two figures the app cannot guess and will not invent: the monthly interest
-- rate a card applies to an unpaid statement, and the flat fee it adds for
-- missing the due date. Both are per-card and both are optional - a card that
-- carries neither is simply never offered an estimate, which is the honest
-- behaviour rather than a confident ₱0.00.
--
-- They are only ever used to ESTIMATE. A finance charge is a real line the
-- bank posts to your card, computed on average daily balance by most issuers,
-- so Spendr writes it as an ordinary expense when you confirm the figure - see
-- src/lib/financeCharge.js. Nothing here is used to decide anything on its own.
--
-- ── Safe to run, and safe NOT to ─────────────────────────────────────────
--
-- Two ADD COLUMN IF NOT EXISTS on an existing table, both nullable, no
-- default to write and no existing row touched. Your transactions are not
-- read, rewritten or re-keyed by this: it is additive only.
--
-- Order does not matter, for the same reason 005 explains. pushTable sends
-- every local account in one upsert and PostgREST rejects the whole request
-- if it names a column the table does not have - so `accounts` lists both of
-- these in OPTIONAL_COLS (src/lib/sync.js), and the push drops them and
-- retries once if this has not been run. Before it runs, the two figures are
-- stored locally and are per-device. After it runs, they sync like any other
-- account field, with nothing to switch on.

-- Monthly rate, as a percentage: 3.0 means 3% a month, which is roughly what
-- PH issuers charge. numeric rather than a float, because it is money-adjacent
-- and 3.5 has no exact binary form.
alter table public.accounts
  add column if not exists interest_rate numeric;

-- A flat fee, in pesos. Capped at the minimum due when applied - no issuer
-- charges a ₱500 late fee against a ₱300 minimum.
alter table public.accounts
  add column if not exists late_fee numeric;
