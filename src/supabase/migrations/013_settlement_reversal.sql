-- 013 — What a settlement moved, so it can be moved back.
--
-- Two nullable columns on transactions.
--
-- ── The bug ──
--
-- Settling with somebody does two writes: a row in the ledger for the money,
-- and an amountPaid bump on each debt it covers. Nothing joined them. So
-- deleting the transaction gave the money back and left every row it had
-- settled still marked paid - they owe you again and no screen says so.
--
-- settles records the allocation: which rows, and how much each one moved.
-- deleteTxGroup reverses exactly that, and the Undo on the toast is the same
-- reversal reached a different way rather than a second implementation.
--
-- credit_sync_id is the other half. Paying more than was owed opens a credit
-- row for the remainder, and that row is not history - it is the leftover of
-- this exact payment, so it goes when the payment does.
--
-- ── Why syncId and not the local id ──
--
-- Both point at debts by their STABLE id (011), not by local_id. A local_id
-- is a Dexie counter: it means nothing on another device and does not
-- survive a restore on this one. Keyed that way, a settlement made on the
-- phone and deleted on the laptop would reverse nothing at all - silently,
-- since there is no row to fail on. The local id is kept alongside as a fast
-- path for the device that wrote it, and is never trusted on its own.
--
-- jsonb rather than a join table: the allocation is meaningless apart from
-- the transaction it belongs to, it is read only when that transaction is
-- deleted, and nothing ever queries across it.
--
-- Additive and nullable, so a client that has not shipped this still syncs -
-- OPTIONAL_COLS drops both and retries. Degraded means a settlement deleted
-- on an old client leaves the debt paid, which is exactly today's behaviour.

alter table public.transactions
  add column if not exists settles jsonb;

alter table public.transactions
  add column if not exists credit_sync_id text;
