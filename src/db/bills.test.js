import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Which due date of a bill is paid, read from the charges (db/bills.js): a
 * bill sent back by another device's older copy puts itself right, and a due
 * date already paid is recognised wherever it was paid.
 */

/** @type {{recurring: any[], transactions: any[]}} */
let store
/** @param {() => any[]} rows */
const table = (rows) => ({
  async toArray() { return rows().map(r => ({ ...r })) },
  /** @param {(r: any) => boolean} fn */
  filter(fn) {
    const hits = () => rows().filter(fn)
    return { async first() { return hits()[0] }, async toArray() { return hits() } }
  },
  /** @param {number} id @param {any} patch */
  async update(id, patch) { const r = rows().find(x => x.id === id); if (r) Object.assign(r, patch); return r ? 1 : 0 },
})
vi.mock('./db', () => ({ default: { recurring: table(() => store.recurring), transactions: table(() => store.transactions) } }))

const { chargeFor, settlePaidBills } = await import('./bills')

const bill = (over = {}) => ({ id: 1, syncId: 'b-rent', name: 'Rent', frequency: 'monthly', dueDay: 5, nextDate: '2026-10-05', active: true, ...over })
const charge = (over = {}) => ({ id: 100, txId: 'c1', type: 'expense', amount: 12000, recurringSyncId: 'b-rent', recurringPrevDate: '2026-10-05', ...over })

beforeEach(() => { store = { recurring: [bill()], transactions: [] } })

describe('chargeFor', () => {
  it('finds the charge that paid this due date, by the bill\'s own id or its stable one', async () => {
    store.transactions = [charge()]
    expect(await chargeFor(bill())).toMatchObject({ txId: 'c1' })
    store.transactions = [charge({ recurringSyncId: null, recurringId: 1 })]
    expect(await chargeFor(bill())).toMatchObject({ txId: 'c1' })
  })

  it('finds nothing for another due date, or another bill', async () => {
    store.transactions = [charge({ recurringPrevDate: '2026-09-05' }), charge({ id: 101, recurringSyncId: 'b-other' })]
    expect(await chargeFor(bill())).toBeUndefined()
  })
})

describe('settlePaidBills', () => {
  it('moves a bill sent back to a due date already paid on to its next one', async () => {
    store.transactions = [charge()]
    expect(await settlePaidBills()).toBe(1)
    expect(store.recurring[0].nextDate).toBe('2026-11-05')
  })

  it('moves past every period already paid, and keeps a bill\'s day', async () => {
    store.recurring = [bill({ nextDate: '2026-01-31', dueDay: 31 })]
    store.transactions = [charge({ recurringPrevDate: '2026-01-31' }), charge({ id: 101, recurringPrevDate: '2026-02-28' })]
    await settlePaidBills()
    expect(store.recurring[0].nextDate).toBe('2026-03-31')
  })

  it('leaves a bill alone when its due date is not paid, when it is paused, and when there are no charges', async () => {
    store.recurring = [bill(), bill({ id: 2, syncId: 'b-gym', active: false })]
    store.transactions = [charge({ recurringSyncId: 'b-gym' })]
    expect(await settlePaidBills()).toBe(0)
    expect(store.recurring.map(r => r.nextDate)).toEqual(['2026-10-05', '2026-10-05'])
  })
})
