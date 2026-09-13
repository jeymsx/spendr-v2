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
  isLocalIdConflict,
  deleteRecurringRemote,
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
    /** @type {Debt} */
    const local = {
      name: 'Gelo', contact: '0917', amount: 5000, amountPaid: 1500,
      dueDate: '2026-10-01', type: 'i_owe', notes: 'lunch',
      createdAt: 'a', updatedAt: 'b',
      sourceTxId: null, sourceCategory: null, archivedAt: null,
    }
    expect(rowToDebt(debtToRow(local, UID))).toEqual(local)
  })

  /**
   * A receivable opened by a shared expense. The two source columns are what
   * let settling it land back on the category the money left from, instead of
   * being booked as income - so losing them in the round trip would quietly
   * reintroduce the bug 009 exists to fix.
   */
  it('round-trips the source of a shared expense', () => {
    /** @type {Debt} */
    const local = {
      name: 'Gelo', contact: '0917', amount: 2250, amountPaid: 0,
      dueDate: null, type: 'owed_to_me', notes: null,
      createdAt: 'a', updatedAt: 'b',
      sourceTxId: 'dinner-tx', sourceCategory: 'Dining', archivedAt: null,
    }
    expect(rowToDebt(debtToRow(local, UID))).toEqual(local)
  })

  /**
   * A shared subscription. The split crosses as what was TYPED - a mode and
   * some values - because a bill that changes price has to re-divide the new
   * amount rather than keep last year's pesos. See 010.
   */
  it('round-trips a bill that several people share', () => {
    /** @type {Recurring} */
    const local = {
      name: 'iCloud', amount: 699, category: 'Bills', account: 'GCash',
      frequency: 'monthly', nextDate: '2026-10-05', active: true, updatedAt: 'b',
      split: {
        mode: 'shares',
        you: { included: true, value: '2' },
        people: [{ name: 'Gelo', value: '1' }],
      },
    }
    expect(rowToRecurring(recurringToRow(local, UID))).toEqual(local)
  })

  it('round-trips a bill', () => {
    /** @type {Recurring} */
    const local = {
      name: 'Netflix', amount: 549, category: 'Bills', account: 'GCash',
      frequency: 'monthly', nextDate: '2026-10-05', active: true, updatedAt: 'b',
      split: null,
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

/**
 * The one push error sync recovers from instead of throwing.
 *
 * Renaming an account makes its push an INSERT carrying a local_id that is
 * already taken remotely, and the constraint it violates is not the one the
 * upsert resolves on - so no upsert can get past it, and because the pushes
 * run in sequence, one rename stopped every table after it. 008 drops the
 * constraint; this is what keeps sync alive until that is run.
 *
 * The regex is the whole risk. Too broad and it swallows real rejections.
 */
describe('isLocalIdConflict', () => {
  it('recognises the rejection a rename actually produces', () => {
    expect(isLocalIdConflict(
      'duplicate key value violates unique constraint "accounts_user_id_local_id_key"',
    )).toBe(true)
    expect(isLocalIdConflict(
      'duplicate key value violates unique constraint "categories_user_id_local_id_key"',
    )).toBe(true)
  })

  /**
   * The draft this replaced alternated on the bare SQLSTATE, which is every
   * unique violation there is. A duplicate NAME is a real rejection the user
   * has to see - retrying it with a column stripped would hide it.
   */
  it('leaves every other unique violation alone', () => {
    expect(isLocalIdConflict(
      'duplicate key value violates unique constraint "accounts_user_id_name_key"',
    )).toBe(false)
    expect(isLocalIdConflict(
      'duplicate key value violates unique constraint "transactions_user_id_tx_id_key"',
    )).toBe(false)
    expect(isLocalIdConflict('23505')).toBe(false)
  })

  it('is not tripped by an unrelated failure, or by nothing at all', () => {
    expect(isLocalIdConflict(`could not find the 'interest_rate' column`)).toBe(false)
    expect(isLocalIdConflict('')).toBe(false)
    expect(isLocalIdConflict(undefined)).toBe(false)
  })
})

/**
 * The bill that came back from the dead.
 *
 * Reported from a phone: two iCloud bills, one at the old 599 and one at the
 * edited 699, and deleting the 599 brought it straight back on refresh.
 *
 * Two faults, and it needed both to happen:
 *
 *   The pull matched a remote bill to a local one on NAME AND AMOUNT. Edit
 *   the amount and the match breaks, so the remote row is added as a second
 *   bill rather than recognised as the same one.
 *
 *   The remote delete was queued by local_id alone. Local ids shift whenever
 *   the database is cleared and re-filled - a JSON restore does exactly that,
 *   since Dexie's auto-increment does not reset - so the delete was aimed at
 *   an id the remote row no longer had. It matched nothing, the row survived,
 *   and the next pull put it back.
 */
describe('deleteRecurringRemote', () => {
  it('queues a delete by id AND by name', async () => {
    /** @type {any[]} */
    const queued = []
    await deleteRecurringRemote(11, 'iCloud Subscription', (t, m) => queued.push({ t, m }))
    expect(queued).toEqual([
      { t: 'recurring', m: { local_id: 11 } },
      { t: 'recurring', m: { name: 'iCloud Subscription' } },
    ])
  })

  /** A stale id must not stop the name delete from going out. */
  it('still queues the name when there is no id', async () => {
    /** @type {any[]} */
    const queued = []
    await deleteRecurringRemote(null, 'iCloud Subscription', (t, m) => queued.push({ t, m }))
    expect(queued).toEqual([{ t: 'recurring', m: { name: 'iCloud Subscription' } }])
  })

  it('queues nothing it cannot identify', async () => {
    /** @type {any[]} */
    const queued = []
    await deleteRecurringRemote(null, '', (t, m) => queued.push({ t, m }))
    expect(queued).toEqual([])
  })
})

/**
 * The stable id (011 + db v11).
 *
 * The assertion that matters is the NEGATIVE one. A row pulled from a database
 * that has not been stamped yet must leave the local syncId alone, and the way
 * that is done is by omitting the key entirely rather than mapping it to null -
 * because `dexieTable.update(id, {syncId: null})` writes the null, and writing
 * the null erases the identity the device just minted. Nothing throws when that
 * regresses; the ids simply stop being stable again, which is the bug.
 */
describe('syncId: the stable identity', () => {
  const withSync = { syncId: 'stable-uuid' }

  const acct = { name: 'BPI', type: 'bank' }
  const cat = { name: 'Food', type: 'expense' }
  const debt = { id: 1, name: 'd', amount: 10, type: 'owed_to_me' }
  const rec = { id: 1, name: 'r', amount: 10, frequency: 'monthly', nextDate: '2026-09-01' }
  const tpl = { id: 1, name: 't', type: 'expense' }
  const goal = { id: 1, name: 'g', target: 100 }

  it('goes out on every table that has one', () => {
    expect(accountToRow({ ...acct, ...withSync }, UID).sync_id).toBe('stable-uuid')
    expect(categoryToRow({ ...cat, ...withSync }, UID).sync_id).toBe('stable-uuid')
    expect(debtToRow({ ...debt, ...withSync }, UID).sync_id).toBe('stable-uuid')
    expect(recurringToRow({ ...rec, ...withSync }, UID).sync_id).toBe('stable-uuid')
    expect(templateToRow({ ...tpl, ...withSync }, UID).sync_id).toBe('stable-uuid')
    expect(goalToRow({ ...goal, ...withSync }, UID).sync_id).toBe('stable-uuid')
  })

  it('sends null rather than undefined for a row minted before v11', () => {
    /* undefined would be dropped from the JSON body and the column left at
       whatever it already held; null is an explicit "this row has no id yet". */
    expect(accountToRow(acct, UID).sync_id).toBeNull()
    expect(debtToRow(debt, UID).sync_id).toBeNull()
  })

  it('comes back in, when the server has one', () => {
    expect(rowToAccount({ name: 'BPI', sync_id: 'x' }).syncId).toBe('x')
    expect(rowToCategory({ name: 'Food', sync_id: 'x' }).syncId).toBe('x')
    expect(rowToDebt({ name: 'd', sync_id: 'x' }).syncId).toBe('x')
    expect(rowToRecurring({ name: 'r', sync_id: 'x' }).syncId).toBe('x')
    expect(rowToTemplate({ name: 't', sync_id: 'x' }).syncId).toBe('x')
    expect(rowToGoal({ name: 'g', sync_id: 'x' }).syncId).toBe('x')
  })

  /** The one that protects the identity. */
  it('leaves the key out entirely when the server has none', () => {
    for (const mapped of [
      rowToAccount({ name: 'BPI' }),
      rowToCategory({ name: 'Food' }),
      rowToDebt({ name: 'd' }),
      rowToRecurring({ name: 'r' }),
      rowToTemplate({ name: 't' }),
      rowToGoal({ name: 'g' }),
    ]) {
      expect('syncId' in mapped).toBe(false)
    }
  })

  it('leaves it out for an explicit null too, not just a missing column', () => {
    expect('syncId' in rowToDebt({ name: 'd', sync_id: null })).toBe(false)
  })

  /* Spreading a pulled row over a local one is how pullSimpleTable writes an
     update. This is that, and it is the regression the rule above prevents. */
  it('survives being spread over a stamped local row', () => {
    const local = { id: 3, name: 'BPI', syncId: 'mine' }
    expect({ ...local, ...rowToAccount({ name: 'BPI' }) }.syncId).toBe('mine')
    expect({ ...local, ...rowToAccount({ name: 'BPI', sync_id: 'theirs' }) }.syncId).toBe('theirs')
  })
})
