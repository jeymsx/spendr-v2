import { describe, it, expect } from 'vitest'
import {
  outstanding, isSettled, personKey, byPerson, totals, applyPayment,
} from './people'

/**
 * The running balance, which exists to make the ORDER of events stop
 * mattering. So most of these tests are the same scenario played in different
 * sequences, checking the number lands in the same place.
 */

/** @param {any} over */
const owes = (over = {}) => ({
  id: 1, contact: 'Gelo', type: 'owed_to_me', amount: 100, amountPaid: 0,
  createdAt: '2026-09-01', ...over,
})
/** @param {any} over */
const youOwe = (over = {}) => ({
  id: 2, contact: 'Gelo', type: 'i_owe', amount: 100, amountPaid: 0,
  createdAt: '2026-09-01', ...over,
})

describe('outstanding', () => {
  it('is what is left, never negative', () => {
    expect(outstanding({ amount: 100, amountPaid: 30 })).toBe(70)
    expect(outstanding({ amount: 100, amountPaid: 150 })).toBe(0)
    expect(isSettled({ amount: 100, amountPaid: 100 })).toBe(true)
  })
})

describe('personKey', () => {
  /** Two balances for one person is the bug this prevents. */
  it('treats one person as one person, whatever the casing', () => {
    expect(personKey({ contact: 'Gelo' })).toBe(personKey({ contact: '  gelo ' }))
  })

  it('falls back to the name when there is no contact', () => {
    expect(personKey({ name: 'Mika' })).toBe('mika')
  })
})

describe('byPerson', () => {
  it('nets both directions into one number', () => {
    const [p] = byPerson([owes({ amount: 175 }), youOwe({ id: 2, amount: 100 })])
    expect(p.label).toBe('Gelo')
    expect(p.net).toBe(75)
  })

  /** Negative means they are ahead, which is what an early payment looks like. */
  it('goes negative when you owe them more than they owe you', () => {
    const [p] = byPerson([owes({ amount: 174.75 }), youOwe({ id: 2, amount: 175 })])
    expect(p.net).toBe(-0.25)
  })

  it('ignores what is already settled', () => {
    const [p] = byPerson([owes({ amount: 100, amountPaid: 100 }), owes({ id: 3, amount: 40 })])
    expect(p.net).toBe(40)
    expect(p.open).toBe(1)
    expect(p.settled).toBe(1)
  })

  it('puts anyone outstanding above anyone square, biggest first', () => {
    const people = byPerson([
      { id: 1, contact: 'Anna', type: 'owed_to_me', amount: 50, amountPaid: 50 },
      { id: 2, contact: 'Gelo', type: 'owed_to_me', amount: 300 },
      { id: 3, contact: 'Mika', type: 'owed_to_me', amount: 900 },
    ])
    expect(people.map(p => p.label)).toEqual(['Mika', 'Gelo', 'Anna'])
  })

  /**
   * Same person, typed two ways. They share a key, so the balance is one
   * number - and the header shows whichever spelling is newest rather than
   * whichever row happens to be first.
   *
   * "Gelo R" is NOT this case and must not be: a different name is a
   * different person, and merging them would silently pool two balances.
   */
  it('shows the most recent capitalisation of one name', () => {
    const [p] = byPerson([
      { id: 1, contact: 'gelo', type: 'owed_to_me', amount: 10, updatedAt: '2026-01-01' },
      { id: 2, contact: 'Gelo', type: 'owed_to_me', amount: 10, updatedAt: '2026-09-01' },
    ])
    expect(p.label).toBe('Gelo')
    expect(p.net).toBe(20)
  })

  it('keeps genuinely different names apart', () => {
    const people = byPerson([
      { id: 1, contact: 'Gelo', type: 'owed_to_me', amount: 10 },
      { id: 2, contact: 'Gelo R', type: 'owed_to_me', amount: 10 },
    ])
    expect(people).toHaveLength(2)
  })

  it('skips a row with nobody on it rather than inventing a blank person', () => {
    expect(byPerson([{ id: 1, type: 'owed_to_me', amount: 10 }])).toEqual([])
  })
})

describe('the order stops mattering', () => {
  /**
   * The whole point. Gelo pays ₱175 for a ₱174.75 share, and it comes to the
   * same 25 centavos in his favour whichever way round the two events arrive.
   */
  const share = { id: 1, contact: 'Gelo', type: 'owed_to_me', amount: 174.75, createdAt: '2026-09-15' }
  const advance = { id: 2, contact: 'Gelo', type: 'i_owe', amount: 175, createdAt: '2026-09-10' }

  it('pays first, then the bill posts', () => {
    expect(byPerson([advance, share])[0].net).toBe(-0.25)
  })

  it('bill posts, then they pay', () => {
    expect(byPerson([share, advance])[0].net).toBe(-0.25)
  })

  it('and a second month just moves the number again', () => {
    const oct = { id: 3, contact: 'Gelo', type: 'owed_to_me', amount: 174.75, createdAt: '2026-10-15' }
    expect(byPerson([advance, share, oct])[0].net).toBe(174.5)
  })
})

describe('totals', () => {
  it('reports the two directions separately, and the net', () => {
    const t = totals(byPerson([
      { id: 1, contact: 'Gelo', type: 'owed_to_me', amount: 300 },
      { id: 2, contact: 'Mika', type: 'i_owe', amount: 100 },
    ]))
    expect(t).toEqual({ owedToYou: 300, youOwe: 100, net: 200 })
  })
})

describe('applyPayment', () => {
  const rows = [
    owes({ id: 1, amount: 100, createdAt: '2026-07-01' }),
    owes({ id: 2, amount: 200, createdAt: '2026-08-01' }),
  ]

  it('settles the oldest first', () => {
    const { updates, credit } = applyPayment(rows, 100)
    expect(updates).toEqual([{ id: 1, amountPaid: 100 }])
    expect(credit).toBe(0)
  })

  it('spills into the next row when it more than covers the first', () => {
    const { updates } = applyPayment(rows, 250)
    expect(updates).toEqual([{ id: 1, amountPaid: 100 }, { id: 2, amountPaid: 150 }])
  })

  /**
   * Paying more than is owed is not an error. It is what a round number looks
   * like, and what an early payment looks like when nothing is owed yet.
   */
  it('hands back whatever is left as credit', () => {
    const { updates, credit } = applyPayment(rows, 500)
    expect(updates).toHaveLength(2)
    expect(credit).toBe(200)
  })

  it('is all credit when they owe nothing at all', () => {
    expect(applyPayment([], 175)).toEqual({ updates: [], credit: 175 })
  })

  it('leaves the other direction alone', () => {
    const mixed = [...rows, youOwe({ id: 9, amount: 999 })]
    const { updates } = applyPayment(mixed, 100)
    expect(updates).toEqual([{ id: 1, amountPaid: 100 }])
  })

  it('tops up a part-paid row rather than overwriting it', () => {
    const { updates } = applyPayment([owes({ id: 1, amount: 100, amountPaid: 40 })], 30)
    expect(updates).toEqual([{ id: 1, amountPaid: 70 }])
  })
})
