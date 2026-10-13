-- 009 — Refunds, split purchases, and shared expenses.
--
-- Four nullable columns. No table is created, no row is rewritten, nothing is
-- re-keyed, and every one of them is additive - a database that has not run
-- this still syncs, it just loses the links (see the end of this file).
--
-- ── transactions.refund_of ───────────────────────────────────────────────
--
-- The tx_id of the purchase this refund came back from.
--
-- A refund is stored as an ordinary expense with a NEGATIVE amount, which is
-- the part that matters and the part this column is not. 45 places in the app
-- sum `type = 'expense'`; a fourth transaction type would have to be taught to
-- every one of them, and the failure when one is missed is silent - that
-- screen simply overstates what you spent. A negative amount needs none of
-- them changed, because they all add. The sign carries the arithmetic.
--
-- This column carries the MEANING: which purchase came back, so the original
-- can say "Refunded 500 of 2,400" and the refund form can stop you handing
-- back more than you spent. text, not a foreign key to transactions.tx_id:
-- the row it points at may not have synced yet, and a refund that cannot be
-- written because its purchase is still queued would be worse than a link
-- that is briefly unresolved.
--
-- ── transactions.split_id ────────────────────────────────────────────────
--
-- One purchase filed under several categories is N ordinary expenses sharing
-- this id, not one row holding an array. Same reasoning as above: each leg is
-- simply an expense, so every existing sum-by-category is already correct
-- about a split without knowing splits exist. The id is only how the UI shows
-- them as one thing and deletes them as a unit.
--
-- This is the shape installments already use locally (installmentId), which
-- has never been mapped here - the client falls back to matching on the
-- "(n/N)" suffix. Splits have no such suffix to fall back to, so unlike
-- installments they do cross.
--
-- ── debts.source_tx_id and debts.source_category ─────────────────────────
--
-- A shared expense: you paid the whole bill, some of it is owed back to you.
--
-- The expense is recorded at its FULL amount, because that is what left your
-- account, and a receivable is opened for their share. When they pay you
-- back, that settlement is a refund against the category the money originally
-- left from - which is what these two columns are for.
--
-- This is a correctness fix as much as a feature. Today a debt collection is
-- written as an INFLOW categorised "Debt Collection", so covering a 3,000
-- dinner and being repaid 2,250 leaves Dining overstated at 3,000 and counts
-- the repayment as income. Neither is true. With the source recorded, the
-- settlement lands back on Dining and income is left alone.
--
-- ── Safe to run, and safe not to ─────────────────────────────────────────
--
-- Four ADD COLUMN IF NOT EXISTS, all nullable, no default to write.
--
-- Before this runs, the client drops the unknown columns and retries the push
-- (OPTIONAL_COLS in src/lib/sync.js, which the transactions push now consults
-- too - it did not before, and 009 would otherwise have been the first
-- migration able to stop the ledger syncing rather than degrade it).
--
-- Degraded means: a refund still nets correctly on another device, because it
-- is a negative amount and every sum adds. What is lost is the link - the
-- "Refunded 500 of 2,400" line, the cap on the refund form, and split legs
-- reading as one purchase. Wrong nowhere, thinner until you run this.

alter table public.transactions
  add column if not exists refund_of text;

alter table public.transactions
  add column if not exists split_id text;

alter table public.debts
  add column if not exists source_tx_id text;

alter table public.debts
  add column if not exists source_category text;

-- Finding every refund for a purchase is the one query these add, and it runs
-- on every transaction detail view. Partial, because the overwhelming
-- majority of rows are ordinary purchases with nothing to point at, and there
-- is no reason to carry them in the index.
create index if not exists transactions_refund_of_idx
  on public.transactions (user_id, refund_of)
  where refund_of is not null;

create index if not exists transactions_split_id_idx
  on public.transactions (user_id, split_id)
  where split_id is not null;
