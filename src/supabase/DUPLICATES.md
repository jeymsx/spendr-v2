# The duplicate rows, and why the fix is not a DELETE

Measured against the live database on 2026-09-14. **Nothing here has been
run.** It is a diagnosis and a plan, deliberately not a migration file, so
that nobody applies it by reflex along with the numbered ones.

## What is there

| table | rows | real | extra | conflict target |
|---|---|---|---|---|
| debts | 39 | 12 | **27** | `user_id,local_id` |
| recurring | 10 | 4 | **6** | `user_id,local_id` |
| templates | 9 | 3 | **6** | `user_id,local_id` |
| transactions | 1032 | 1032 | 0 | `user_id,tx_id` |
| accounts | 10 | 10 | 0 | `user_id,name` |
| categories | 14 | 14 | 0 | `user_id,name,type` |

The three tables keyed on `local_id` are exactly the three with duplicates.
The three keyed on something stable have none. That is the entire argument for
migration 011 restated as evidence: 1,032 transactions have survived a year,
several devices and at least one JSON restore without a single duplicate,
because `tx_id` is minted once and travels with the row.

`local_id` is a Dexie auto-increment counter, and `clear()` does not reset it.
Restore a backup and the same twelve debts come back as ids 26-39. The next
push resolves on `(user_id, local_id)`, matches nothing, and inserts twelve
more rows. Do it twice and you have what is there now.

## Why deleting the extras is not the fix

The obvious repair - keep one row per `(contact, amount, type, created_at)`
and delete the rest - would work for about a minute.

The duplicates are on the CLIENT too. `sync_id` is present on remote debts
1-18, 21, 22, 23 and 25, and a row only gets one when a client pushed a local
row with that `local_id`. So the client holds local rows at ids 5, 6 AND 21,
all of them Robina 527. Clean the server alone and the next sync re-uploads
them.

So the repair has to run in this order, and the first step is the one that
matters:

1. **Deduplicate locally**, on the device that has the real data. One row per
   logical debt, keeping the earliest `createdAt` and the largest
   `amountPaid`, since a part payment recorded against one copy must not be
   thrown away with it.
2. **Push**, which stamps the survivors with their `sync_id`.
3. **Sweep the server** of rows for that user that still have `sync_id is
   null` - by then, exactly the orphans.
4. **Flip the conflict target** to `user_id,sync_id` for the three tables, so
   it cannot happen again.

Step 4 is the one that must not go first. Flip while rows are unstamped and
every push becomes an INSERT, which duplicates the entire dataset rather than
repairing it.

## What is safe to do today

Nothing about this is urgent in the sense of losing money. The ledger is
untouched, every balance derives from `transactions`, and the duplicates are
reminders rather than amounts: a debts page that lists Robina three times is
wrong to read and right in total, because settling one does not settle the
others but nothing double-counts against an account.

It is worth doing before the `sync_id` flip, and worth doing on a day when
the person whose data it is can look at the list first.
