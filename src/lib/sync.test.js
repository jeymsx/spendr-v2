import { describe, it, expect } from 'vitest'
import {
  toSupabaseRow, toDexieRecord,
  accountToRow, rowToAccount,
  categoryToRow, rowToCategory,
  debtToRow, rowToDebt,
  recurringToRow, rowToRecurring,
  templateToRow, rowToTemplate,
  goalToRow, rowToGoal,
  badgeToRow,
  isPendingDelete,
} from './sync'
import { UNSYNCED, SYNCED } from '../db/db'

/**
 * The sync mappers, which had no tests and are the scariest code in the app.
 *
 * ── What is actually at risk here ──
 *
 * The two schemas disagree about one thing, and it is the thing most likely to
 * go wrong silently: Dexie keys a one-sided entry on `account`, and Supabase
 * keys every row on from_account/to_account. So an EXPENSE's account is
 * `from_account` remotely and an INFLOW's is `to_account`, while a TRANSFER
 * uses both and neither maps to `account` at all.
 *
 * Get that backwards and nothing throws. The row saves, the push succeeds, and
 * a month later a pull hands back a ledger where the money went the wrong way.
 * No unit test existed for it, and no integration test can run without a live
 * Supabase, so this is where the coverage belongs: the mappers are pure, and
 * round-tripping them is the exact assertion that matters.
 *
 * Everything here is a pure function of its argument - no clock beyond a
 * fallback timestamp, no database, no network.
 */

const UID = 'user-123'

describe('transactions: the account asymmetry', () => {
  it('puts an expense account in from_account, and nothing in to_account', () => {
    const row = toSupabaseRow(
      { type: 'expense', account: 'GCash', amount: 260, date: '2026-09-09' }, UID)
    expect(row.from_account).toBe('GCash')
    expect(row.to_account).toBeNull()
  })

  it('puts an inflow account in to_account, and nothing in from_account', () => {
    const row = toSupabaseRow(
      { type: 'inflow', account: 'BPI', amount: 42000, date: '2026-09-15' }, UID)
    expect(row.to_account).toBe('BPI')
    expect(row.from_account).toBeNull()
  })

  it('uses both sides for a transfer, and ignores `account`', () => {
    const row = toSupabaseRow({
      type: 'transfer', account: 'IGNORED',
      fromAccount: 'Cash', toAccount: 'BPI', amount: 1000, date: '2026-09-10',
    }, UID)
    expect(row.from_account).toBe('Cash')
    expect(row.to_account).toBe('BPI')
  })

  it('round-trips an expense back onto `account`', () => {
    const local = { type: 'expense', account: 'GCash', amount: 260, date: '2026-09-09' }
    const back = toDexieRecord(toSupabaseRow(local, UID))
    expect(back.account).toBe('GCash')
    expect(back.fromAccount).toBeNull()
    expect(back.toAccount).toBeNull()
  })

  it('round-trips an inflow back onto `account`', () => {
    const local = { type: 'inflow', account: 'BPI', amount: 42000, date: '2026-09-15' }
    const back = toDexieRecord(toSupabaseRow(local, UID))
    expect(back.account).toBe('BPI')
  })

  it('round-trips a transfer back onto both sides, in the same direction', () => {
    const local = {
      type: 'transfer', fromAccount: 'Cash', toAccount: 'BPI',
      amount: 1000, date: '2026-09-10',
    }
    const back = toDexieRecord(toSupabaseRow(local, UID))
    expect(back.fromAccount).toBe('Cash')
    expect(back.toAccount).toBe('BPI')
    expect(back.account).toBeNull()
  })

  it('carries the txId, which is the identity that survives the trip', () => {
    const row = toSupabaseRow(
      { txId: 'abc-123', type: 'expense', account: 'Cash', amount: 10, date: '2026-01-01' }, UID)
    expect(row.tx_id).toBe('abc-123')
    expect(toDexieRecord(row).txId).toBe('abc-123')
  })

  it('tolerates a row from before txId existed', () => {
    const row = toSupabaseRow({ type: 'expense', account: 'Cash', amount: 10, date: '2026-01-01' }, UID)
    expect(row.tx_id).toBeNull()
  })

  it('marks anything pulled as synced, so the next push does not echo it back', () => {
    expect(toDexieRecord({ type: 'expense', from_account: 'Cash', amount: 1 }).synced).toBe(SYNCED)
    expect(SYNCED).not.toBe(UNSYNCED)
  })

  it('stamps an updated_at when the local row has none', () => {
    const row = toSupabaseRow({ type: 'expense', account: 'Cash', amount: 1, date: '2026-01-01' }, UID)
    expect(typeof row.updated_at).toBe('string')
    expect(Number.isNaN(Date.parse(row.updated_at))).toBe(false)
  })
})

describe('accounts', () => {
  /** @type {Account} */
  const local = {
    name: 'BPI', type: 'bank', role: 'savings', balance: 64906, currency: 'PHP',
    creditLimit: null, statementDate: null, dueDate: null, cutoffDate: null,
    minimumPayment: null, color: '#b91c1c', qrImage: null, parentName: null,
    design: 'mosaic', customColor: false, sort_order: 3, updatedAt: '2026-09-01T00:00:00.000Z',
  }

  it('round-trips every field it claims to carry', () => {
    expect(rowToAccount(accountToRow(local, UID))).toMatchObject(local)
  })

  it('round-trips a credit card, whose columns are all null on an asset account', () => {
    const card = {
      ...local, name: 'Maya Credit', type: 'credit', role: 'credit',
      creditLimit: 50000, statementDate: 15, dueDate: 5, cutoffDate: 15, minimumPayment: 500,
    }
    const back = rowToAccount(accountToRow(card, UID))
    expect(back.creditLimit).toBe(50000)
    expect(back.statementDate).toBe(15)
    expect(back.minimumPayment).toBe(500)
  })

  /**
   * A pull from a table that predates the design/custom_color migration hands
   * back a row with those columns absent. sync.js drops them from the push and
   * retries; the pull has to survive them being undefined, because
   * normalizeDesign turns null into 'classic' and a thrown error turns the
   * whole sync into a failure the user cannot act on.
   */
  it('survives a pull from a table that has not been migrated yet', () => {
    const back = rowToAccount({ name: 'Cash', type: 'cash', balance: 0 })
    expect(back.design).toBeNull()
    expect(back.customColor).toBe(false)
    expect(back.sort_order).toBe(0)
  })
})

describe('categories, debts, bills and templates', () => {
  it('round-trips a category', () => {
    const local = { name: 'Food', icon: '🍔', color: '#f59e0b', type: 'expense', budget: 8000, sort_order: 1, updatedAt: 'x' }
    expect(rowToCategory(categoryToRow(local, UID))).toEqual(local)
  })

  it('round-trips a debt', () => {
    const local = {
      name: 'Gelo', contact: '0917', amount: 5000, amountPaid: 1500,
      dueDate: '2026-10-01', type: 'i_owe', notes: 'lunch',
      createdAt: 'a', updatedAt: 'b',
    }
    expect(rowToDebt(debtToRow(local, UID))).toEqual(local)
  })

  it('round-trips a bill', () => {
    const local = {
      name: 'Netflix', amount: 549, category: 'Bills', account: 'GCash',
      frequency: 'monthly', nextDate: '2026-10-05', active: true, updatedAt: 'b',
    }
    expect(rowToRecurring(recurringToRow(local, UID))).toEqual(local)
  })

  it('round-trips a template, including both transfer sides', () => {
    /** @type {Template} */
    const local = {
      name: 'Rent', type: 'transfer', amount: 12000, description: 'Rent',
      category: null, account: null, fromAccount: 'BPI', toAccount: 'Cash',
      updatedAt: 'b',
    }
    expect(rowToTemplate(templateToRow(local, UID))).toMatchObject(local)
  })

  /**
   * templateToRow used to drop created_at while rowToTemplate read it, so a
   * template's creation date did not survive a round trip.
   *
   * The key is spread in rather than set to null, and that distinction is the
   * test: the remote column defaults to now(), and a Postgres default applies
   * only when the column is OMITTED. Sending an explicit null would store a
   * null and make the round trip worse than the bug.
   */
  it('carries a template createdAt to the server and back', () => {
    const row = templateToRow({ name: 'Rent', type: 'expense', createdAt: 'a' }, UID)
    expect(/** @type {Record<string, any>} */ (row).created_at).toBe('a')
    expect(rowToTemplate(row).createdAt).toBe('a')
  })

  it('omits created_at entirely when there is none, so the server default applies', () => {
    const row = templateToRow({ name: 'Rent', type: 'expense' }, UID)
    expect('created_at' in row).toBe(false)
  })
})

describe('goals', () => {
  it('round-trips the funding accounts array', () => {
    /** @type {Goal} */
    const local = {
      name: 'Emergency fund', icon: '🛟', target: 100000,
      accounts: ['BPI', 'Maya Savings'], targetDate: '2027-06-30',
      priority: 100, archivedAt: null, createdAt: 'a', updatedAt: 'b',
    }
    const back = rowToGoal(goalToRow(local, UID))
    expect(back.accounts).toEqual(['BPI', 'Maya Savings'])
    expect(back.target).toBe(100000)
    expect(back.priority).toBe(100)
  })

  /**
   * Postgres hands back null for an empty jsonb column, and every reader of
   * `accounts` treats it as an array. allocateGoals would throw inside the
   * waterfall rather than report the goal as unfunded, which is a crash on the
   * goals page caused by a column being empty.
   */
  it('turns a null accounts column into an empty array, not a crash', () => {
    expect(rowToGoal({ name: 'x', accounts: null }).accounts).toEqual([])
    expect(rowToGoal({ name: 'x' }).accounts).toEqual([])
    expect(rowToGoal({ name: 'x', accounts: 'BPI' }).accounts).toEqual([])
  })

  it('defaults a missing target and priority to zero rather than undefined', () => {
    const back = rowToGoal({ name: 'x' })
    expect(back.target).toBe(0)
    expect(back.priority).toBe(0)
    expect(back.archivedAt).toBeNull()
  })
})

describe('badges', () => {
  it('sends the key and the date, which is the only thing it cannot recompute', () => {
    const row = badgeToRow({ key: 'first-peso', earnedAt: '2026-01-01T00:00:00.000Z' }, UID)
    expect(row.key).toBe('first-peso')
    expect(row.earned_at).toBe('2026-01-01T00:00:00.000Z')
    expect(row.user_id).toBe(UID)
  })
})

describe('isPendingDelete', () => {
  const pending = [
    { table: 'accounts', match: { name: 'Old Wallet' } },
    { table: 'categories', match: { name: 'Food', type: 'expense' } },
  ]

  it('matches a queued delete so a pull cannot resurrect it', () => {
    expect(isPendingDelete(pending, 'accounts', { name: 'Old Wallet' })).toBe(true)
  })

  it('needs every field of the match, not just one', () => {
    expect(isPendingDelete(pending, 'categories', { name: 'Food', type: 'expense' })).toBe(true)
    // Same name, other side of the ledger - a different category.
    expect(isPendingDelete(pending, 'categories', { name: 'Food', type: 'inflow' })).toBe(false)
  })

  it('does not match across tables', () => {
    expect(isPendingDelete(pending, 'debts', { name: 'Old Wallet' })).toBe(false)
  })

  it('is false on an empty queue', () => {
    expect(isPendingDelete([], 'accounts', { name: 'anything' })).toBe(false)
  })
})
