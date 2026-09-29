import { describe, expect, it } from 'vitest'
import { debtsCountFrom, netWorthBreakdown, netWorthNow } from './netWorth'
import { bucketOf, isLiquid } from './accountMeta'

const wallet = { name: 'Wallet', type: 'cash', balance: 2000, currency: 'PHP' }
const bank = { name: 'BPI', type: 'bank', balance: 50000, currency: 'PHP' }
const mp2 = { name: 'MP2', type: 'investment', balance: 30000, currency: 'PHP' }
const loan = { name: 'Car Loan', type: 'loan', balance: -400000, currency: 'PHP' }
const card = { name: 'Card', type: 'credit', balance: 0, currency: 'PHP', cutoffDate: 25, dueDate: 10 }
const charge = { type: 'expense', account: 'Card', amount: 1500, date: new Date().toISOString() }

describe('which pile an account is in', () => {
  it('fixes the kinds whose meaning never changes, and honours Counts as for the rest', () => {
    expect(bucketOf(card)).toBe('credit')
    expect(bucketOf(loan)).toBe('loan')
    expect(bucketOf(mp2)).toBe('invested')
    expect(bucketOf(wallet)).toBe('spending')
    expect(bucketOf(bank)).toBe('savings')
    expect(bucketOf({ ...bank, role: 'spending' })).toBe('spending')
  })

  it('calls only cash, wallets and banks money you can spend', () => {
    expect([wallet, bank, mp2, loan, card].filter(isLiquid).map(a => a.name)).toEqual(['Wallet', 'BPI'])
  })
})

describe('net worth', () => {
  it('adds what you own and takes off what you owe', () => {
    const b = netWorthBreakdown({
      accounts: [wallet, bank, mp2, loan, card], transactions: [charge], view: 'PHP', rates: null,
    })
    expect(b.spending).toBe(2000)
    expect(b.savings).toBe(50000)
    expect(b.invested).toBe(30000)
    expect(b.credit).toBe(1500)
    expect(b.loans).toBe(400000)
    expect(b.liquid).toBe(50500)
    expect(b.total).toBe(2000 + 50000 + 30000 - 1500 - 400000)
    expect(b.has).toMatchObject({ invested: true, loans: true, people: false })
  })

  it('agrees with the figure the old formula gave a ledger with only cash, banks and cards', () => {
    const accounts = [wallet, bank, card]
    expect(netWorthNow(accounts, [charge], 'PHP', null)).toBe(2000 + 50000 - 1500)
  })

  it('counts debts only when asked, nets them per person, and flags the pile', () => {
    const debts = [
      { name: 'Gelo', type: 'owed_to_me', amount: 1000, amountPaid: 200 },
      { name: 'Ana', type: 'i_owe', amount: 300, amountPaid: 0 },
    ]
    const off = netWorthBreakdown({ accounts: [bank], transactions: [], view: 'PHP', rates: null, debts })
    expect(off.total).toBe(50000)
    const on = netWorthBreakdown({ accounts: [bank], transactions: [], view: 'PHP', rates: null, debts, includeDebts: true })
    expect(on.owedToYou).toBe(800)
    expect(on.youOwe).toBe(300)
    expect(on.total).toBe(50500)
    expect(on.has.people).toBe(true)
  })

  it('reads the Count debts switch as on unless it was turned off', () => {
    expect(debtsCountFrom(undefined)).toBe(true)
    expect(debtsCountFrom(null)).toBe(true)
    expect(debtsCountFrom({ value: true })).toBe(true)
    expect(debtsCountFrom({ value: false })).toBe(false)
  })

  it('in separated mode counts debts only in the ledger currency', () => {
    const usd = { name: 'Wise', type: 'bank', balance: 100, currency: 'USD' }
    const debts = [{ name: 'Gelo', type: 'owed_to_me', amount: 1000, amountPaid: 0 }]
    const scope = (/** @type {any[]} */ accts) => accts.filter(a => a.currency === 'USD')
    const b = netWorthBreakdown({
      accounts: [bank, usd], transactions: [], view: 'USD', ledger: 'PHP', rates: null, debts, includeDebts: true, scope,
    })
    expect(b.total).toBe(100)
  })
})

describe('cards in net worth', () => {
  it('counts an overpaid card as money you have, not as nothing', () => {
    const paid = [
      { type: 'expense', account: 'Card', amount: 1500, date: new Date().toISOString() },
      { type: 'transfer', fromAccount: 'BPI', toAccount: 'Card', amount: 4000, date: new Date().toISOString() },
    ]
    // The bank's stored balance already lost the 4,000; the card holds 2,500 of it.
    const nw = netWorthBreakdown({ accounts: [{ ...bank, balance: 46000 }, card], transactions: paid, view: 'PHP', rates: null })
    expect(nw.credit).toBe(-2500)
    expect(nw.total).toBe(48500)
  })

  it('does not let a cash advance off a card raise net worth', () => {
    const advance = [{ type: 'transfer', fromAccount: 'Card', toAccount: 'Wallet', amount: 1000, date: new Date().toISOString() }]
    const before = netWorthBreakdown({ accounts: [wallet, card], transactions: [], view: 'PHP', rates: null }).total
    const after = netWorthBreakdown({ accounts: [{ ...wallet, balance: 3000 }, card], transactions: advance, view: 'PHP', rates: null }).total
    expect(after).toBe(before)
  })
})
