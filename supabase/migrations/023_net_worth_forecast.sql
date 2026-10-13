-- 023 — Investments, loans, balance corrections and scheduled income.
--
-- Five nullable columns across three existing tables. RUN IT BEFORE ANY
-- DEVICE OPENS A BUILD WITH THIS WORK IN IT - the app keeps syncing without
-- it, but what it cannot send in the meantime does not all come back.
--
-- ── Safe to run ──────────────────────────────────────────────────────────
--
-- ADD COLUMN IF NOT EXISTS only: no DROP, no ALTER of an existing column, no
-- default to write, no row read or rewritten. Re-runnable.
--
-- ── If a device syncs first ──────────────────────────────────────────────
--
-- Every column below is in OPTIONAL_COLS (src/lib/sync.js). A push refused
-- for one of them is retried without THAT column - one at a time, never the
-- conflict target (the net used to drop every optional column at once; see
-- columnsToDrop). So sync keeps working, and until this runs:
--   - an investment syncs with no kind, "paid in" or valued date. Its type
--     travels in the existing `type` column, so other devices still file it
--     under Investments. Accounts and Recurring are pushed whole on every
--     sync, so the server has the new fields after the first push once this
--     has run;
--   - a balance correction or value update syncs without `adjust`, and a
--     transaction is only pushed once, so those rows stay without it on the
--     server. Harmless: the app also recognises both by the fixed
--     description it gives them (src/lib/flows.js);
--   - a salary on Recurring reaches other devices as a bill until the next
--     push after this runs.

-- ── Nothing new in `type` or `frequency` ────────────────────────────────
--
-- Two account types are new ('investment', 'loan') and one recurring
-- frequency ('semimonthly'), but those columns are free text with no check
-- constraint (001, 003), so they need nothing here. Same for the role column:
-- 'invested' and 'loan' are new values in an existing text column.
--
-- No check constraints on the new columns either. The client is the only
-- writer and already validates; a constraint would turn a future value into
-- a rejected push rather than a stored one.

-- ── transactions.adjust ──────────────────────────────────────────────────
-- Marks a row that moves a balance without being income or spending:
--   'correction'  typing a new balance on an account's edit page
--   'value'       an investment's new value (Update value)
-- Null for everything else, which is every row written before this. Rows from
-- before it that are corrections are still recognised by their description
-- ('Balance adjustment'), see src/lib/flows.js.
alter table public.transactions
  add column if not exists adjust text;

comment on column public.transactions.adjust is
  'correction | value: moves a balance, not counted as income or spending. Null for ordinary rows.';

-- ── accounts: investments ────────────────────────────────────────────────
-- What kind of investment: 'fund', 'mp2', 'stocks', 'bonds', 'deposit', 'pera',
-- 'vul', 'gold', 'property', 'business', 'other' (lib/accountMeta.js
-- INVESTMENT_KINDS). A label only; every kind is valued the same way. Free
-- text, so a kind added later needs no migration.
alter table public.accounts
  add column if not exists kind text;

-- What had gone in before the account was added to Spendr. "Paid in" is this
-- plus transfers in, less transfers out; the gain is the value less that.
-- numeric, as every money column here is.
alter table public.accounts
  add column if not exists invested_start numeric;

-- When the value was last typed in: the date on the latest value update, or
-- the day the account was added. Drives "Updated 3 days ago" and the Old
-- value mark after 45 days. Loans reuse minimum_payment, due_date and
-- interest_rate (007), so they need nothing new.
alter table public.accounts
  add column if not exists valued_at timestamp with time zone;

comment on column public.accounts.kind is
  'Investment kind (see INVESTMENT_KINDS in the app): fund, mp2, stocks, bonds, deposit, pera, vul, gold, property, business, other. Null for other account types.';
comment on column public.accounts.invested_start is
  'Investments: amount paid in before the account was tracked.';
comment on column public.accounts.valued_at is
  'Investments: when the value was last updated.';

-- ── recurring.type ───────────────────────────────────────────────────────
-- 'inflow' for income that arrives on a schedule (a salary), 'expense' for a
-- bill. Null is a bill: every row written before this.
alter table public.recurring
  add column if not exists type text;

comment on column public.recurring.type is
  'inflow = scheduled income, expense or null = bill.';
