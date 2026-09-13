import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * fetchReportData — the arithmetic behind the monthly PDF.
 *
 * 231 lines of pure computation with no test, feeding a document people keep.
 * Two things brought it here: a report for a month with no activity still
 * showed a card balance (correct, and pinned below so nobody "fixes" it), and
 * the transfer reversal still carried an assumption that stopped being true
 * when applyBalanceEffect's credit special case was removed.
 *
 * `db` is a small stand-in. Only `.toArray()` and `meta.get()` are reached.
 *
 * @typedef {Record<string, any>} Row
 */

/** @type {{transactions: Row[], accounts: Row[], categories: Row[], meta: Row[]}} */
let store

const listTable = (/** @type {() => Row[]} */ rows) => ({
  async toArray() { return rows().slice() },
  /** @param {string} key */
  async get(key) { return store.meta.find(m => m.key === key) },
})

const db = {
  transactions: listTable(() => store.transactions),
  accounts:     listTable(() => store.accounts),
  categories:   listTable(() => store.categories),
  meta:         listTable(() => store.meta),
}

vi.mock('../db/db', () => ({ default: db, UNSYNCED: 0, SYNCED: 1 }))

const { fetchReportData } = await import('./reportData')

/* "Today" has to be fixed or a report for the month in progress moves under
   the test. Everything below is dated well before it. */
const NOW = new Date('2026-09-13T12:00:00+08:00')

const card = {
  id: 1, name: 'Test Card', type: 'credit',
  creditLimit: 20000, cutoffDate: 25, dueDate: 10, minimumPayment: 500,
  balance: -3200,
}
const wallet = { id: 2, name: 'Wallet', type: 'savings', balance: 10000 }

/** An expense on the card in June, never paid. */
const juneCharge = {
  type: 'expense', account: 'Test Card', amount: 3200,
  category: 'Groceries', date: '2026-06-16T08:00:00+08:00',
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  store = {
    transactions: [juneCharge],
    accounts: [card, wallet],
    categories: [{ name: 'Groceries', type: 'expense' }],
    meta: [{ key: 'displayName', value: 'James' }],
  }
})

describe('a month with no transactions of its own', () => {
  /**
   * Reported as a bug: "I export a month with no transactions and the card
   * balance still stands."
   *
   * It should. A card balance is money owed, and not using the card in August
   * does not settle what June billed. The alternative — a report that shows
   * ₱0 owed because the month was quiet — would be the actual bug, and it is
   * the sort of thing a well-meant "fix" introduces.
   */
  it('still reports what the card owes, because the debt did not go away', async () => {
    const data = await fetchReportData(2026, 8)     // August: nothing happened

    expect(data.transactions).toHaveLength(0)
    expect(data.summary.totalExpenses).toBe(0)
    expect(data.creditDetailMap['Test Card'].balanceUsed).toBe(3200)
    expect(data.totalCreditUsed).toBe(3200)
  })

  it('and nets it off the wallet in the net-worth line', async () => {
    const data = await fetchReportData(2026, 8)

    expect(data.totalAssets).toBe(10000)
    expect(data.netWorth).toBe(6800)
  })

  /**
   * The failure that WOULD be a bug: the balance has to be the one as at that
   * month's end, not the one as of today. A charge in September must not
   * appear in an August report.
   */
  it('reports the balance as at that month, not as of today', async () => {
    store.transactions.push({
      type: 'expense', account: 'Test Card', amount: 5000,
      category: 'Groceries', date: '2026-09-02T08:00:00+08:00',
    })

    const august = await fetchReportData(2026, 8)
    expect(august.creditDetailMap['Test Card'].balanceUsed).toBe(3200)

    const september = await fetchReportData(2026, 9)
    expect(september.creditDetailMap['Test Card'].balanceUsed).toBe(8200)
  })

  /** A month before any of the data exists owes nothing. */
  it('reports zero for a month that predates every transaction', async () => {
    const data = await fetchReportData(2026, 1)

    expect(data.creditDetailMap['Test Card'].balanceUsed).toBe(0)
    expect(data.totalCreditUsed).toBe(0)
  })
})

describe('ending balances', () => {
  /**
   * Reconstructed by reversing everything after the month, so a payment made
   * in September has to be backed out of an August report.
   */
  it('backs a later payment out of the funding account', async () => {
    store.transactions.push({
      type: 'transfer', fromAccount: 'Wallet', toAccount: 'Test Card',
      amount: 3200, date: '2026-09-05T08:00:00+08:00',
    })

    const august = await fetchReportData(2026, 8)
    // The stored wallet balance already has the payment taken out of it, so
    // August has to show it back in. The seed says 10,000 post-payment.
    expect(august.endingBalances['Wallet']).toBe(13200)
  })

  /**
   * The card's own reconstruction has to reverse what applyBalanceEffect
   * applied, and that is now `+a` for EVERY transfer destination — the credit
   * special case was removed when it turned out to have the sign backwards.
   * Reversing a card payment therefore subtracts.
   */
  it('reverses a card payment the same way any other destination is reversed', async () => {
    store.transactions.push({
      type: 'transfer', fromAccount: 'Wallet', toAccount: 'Test Card',
      amount: 3200, date: '2026-09-05T08:00:00+08:00',
    })

    const august = await fetchReportData(2026, 8)
    // Stored -3200 is after a +3200 payment, so before it the card was at
    // -6400. Reversing has to subtract, not add.
    expect(august.endingBalances['Test Card']).toBe(-6400)
  })
})

describe('the month in progress', () => {
  /**
   * An installment plan writes every month's charge up front. Those rows are
   * committed, not spent, so the spend total must not count the ones dated
   * after today even when they fall inside the month being reported.
   */
  it('leaves a charge dated later this month out of what was spent', async () => {
    store.transactions.push(
      { type: 'expense', account: 'Wallet', amount: 100,
        category: 'Groceries', date: '2026-09-10T08:00:00+08:00' },
      { type: 'expense', account: 'Test Card', amount: 999,
        category: 'Groceries', date: '2026-09-28T08:00:00+08:00' },
    )

    const data = await fetchReportData(2026, 9)

    expect(data.summary.totalExpenses).toBe(100)
    expect(data.transactions).toHaveLength(1)
  })
})
