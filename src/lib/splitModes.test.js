import { describe, it, expect } from 'vitest'
import { distribute, resolveSplit, resolveBillShares, SPLIT_MODES, MODE_FIELD } from './splitModes'

/**
 * The arithmetic behind the five split modes.
 *
 * Almost every test here is really the same test: do the shares add up to the
 * money that actually left the account? A bill divided into parts that sum to
 * 99.99 of a 100 peso total is the category-split failure one decimal place
 * down, and it is invisible unless something checks.
 */

/** @param {string} id @param {number} [value] @param {boolean} [included] */
const P = (id, value, included = true) => ({ id, value, included })
/** @param {Record<string, number>} shares */
const sum = (shares) => Math.round(Object.values(shares).reduce((s, n) => s + n, 0) * 100) / 100

describe('distribute', () => {
  it('loses nothing to rounding', () => {
    const got = distribute(10000, [1, 1, 1])       // 100.00 three ways
    expect(got).toEqual([3334, 3333, 3333])
    expect(got.reduce((s, n) => s + n, 0)).toBe(10000)
  })

  it('splits by ratio, not by count', () => {
    expect(distribute(10000, [3, 1])).toEqual([7500, 2500])
  })

  /** Predictable beats random: the same bill has to give the same answer. */
  it('always gives the odd cents to the earliest rows', () => {
    expect(distribute(10, [1, 1, 1, 1])).toEqual([3, 3, 2, 2])
  })

  it('is all zeroes when there is nothing to weigh by', () => {
    expect(distribute(500, [0, 0])).toEqual([0, 0])
  })
})

describe('equal', () => {
  it('splits evenly and exactly', () => {
    const r = resolveSplit({ mode: 'equal', total: 100, participants: [P('you'), P('a'), P('b')] })
    expect(r.valid).toBe(true)
    expect(r.shares).toEqual({ you: 33.34, a: 33.33, b: 33.33 })
    expect(sum(r.shares)).toBe(100)
  })

  /** Excluding somebody is how "I did not eat" gets said. */
  it('leaves excluded people out and re-splits', () => {
    const r = resolveSplit({
      mode: 'equal', total: 100,
      participants: [P('you'), P('a'), P('b', 0, false)],
    })
    expect(r.shares).toEqual({ you: 50, a: 50 })
    expect(r.shares.b).toBeUndefined()
  })
})

describe('exact', () => {
  it('accepts amounts that add up', () => {
    const r = resolveSplit({
      mode: 'exact', total: 1000, participants: [P('you', 400), P('a', 600)],
    })
    expect(r.valid).toBe(true)
    expect(sum(r.shares)).toBe(1000)
  })

  it('says how much is still unassigned, and does not accept it', () => {
    const r = resolveSplit({
      mode: 'exact', total: 1000, participants: [P('you', 400), P('a', 300)],
    })
    expect(r.valid).toBe(false)
    expect(r.remaining).toBe(300)
    expect(r.message).toMatch(/300\.00 left/)
  })

  it('says when it is over', () => {
    const r = resolveSplit({
      mode: 'exact', total: 1000, participants: [P('you', 800), P('a', 400)],
    })
    expect(r.valid).toBe(false)
    expect(r.message).toMatch(/200\.00 over/)
  })
})

describe('percent', () => {
  it('accepts percentages that total 100', () => {
    const r = resolveSplit({
      mode: 'percent', total: 1000, participants: [P('you', 70), P('a', 30)],
    })
    expect(r.valid).toBe(true)
    expect(r.shares).toEqual({ you: 700, a: 300 })
  })

  /**
   * The reason percent goes through distribute rather than multiplying each
   * share out: 33.33% of 100 three times is 99.99.
   */
  it('loses no cents on thirds', () => {
    const r = resolveSplit({
      mode: 'percent', total: 100,
      participants: [P('you', 33.34), P('a', 33.33), P('b', 33.33)],
    })
    expect(r.valid).toBe(true)
    expect(sum(r.shares)).toBe(100)
  })

  it('refuses anything that is not 100, and says by how much', () => {
    const under = resolveSplit({ mode: 'percent', total: 1000, participants: [P('you', 60), P('a', 30)] })
    expect(under.valid).toBe(false)
    expect(under.message).toMatch(/10% left/)

    const over = resolveSplit({ mode: 'percent', total: 1000, participants: [P('you', 60), P('a', 60)] })
    expect(over.message).toMatch(/20% over/)
  })
})

describe('shares', () => {
  /** "Two of us ate, you had one" without anybody doing division. */
  it('divides proportionally by portions', () => {
    const r = resolveSplit({
      mode: 'shares', total: 900, participants: [P('you', 2), P('a', 1)],
    })
    expect(r.valid).toBe(true)
    expect(r.shares).toEqual({ you: 600, a: 300 })
  })

  it('gives a zero-share participant nothing, without breaking the rest', () => {
    const r = resolveSplit({
      mode: 'shares', total: 900, participants: [P('you', 2), P('a', 1), P('b', 0)],
    })
    expect(r.shares.b).toBe(0)
    expect(sum(r.shares)).toBe(900)
  })

  it('needs at least one share to exist', () => {
    const r = resolveSplit({ mode: 'shares', total: 900, participants: [P('you', 0), P('a', 0)] })
    expect(r.valid).toBe(false)
    expect(r.message).toMatch(/at least one/i)
  })
})

describe('adjust', () => {
  /**
   * "Same each, except I had the dessert." The extras come off the top, what
   * is left splits evenly, then the extras go back on.
   */
  it('splits the rest evenly and adds the extras back', () => {
    const r = resolveSplit({
      mode: 'adjust', total: 1000, participants: [P('you', 200), P('a', 0)],
    })
    expect(r.valid).toBe(true)
    // 1000 - 200 = 800 split two ways, then you get your 200 back.
    expect(r.shares).toEqual({ you: 600, a: 400 })
    expect(sum(r.shares)).toBe(1000)
  })

  it('handles a negative adjustment, which is a discount for one person', () => {
    const r = resolveSplit({
      mode: 'adjust', total: 1000, participants: [P('you', -100), P('a', 0)],
    })
    expect(sum(r.shares)).toBe(1000)
    expect(r.shares.you).toBe(450)
    expect(r.shares.a).toBe(550)
  })

  it('refuses extras that exceed the bill', () => {
    const r = resolveSplit({
      mode: 'adjust', total: 100, participants: [P('you', 90), P('a', 90)],
    })
    expect(r.valid).toBe(false)
    expect(r.message).toMatch(/more than 100/)
  })
})

describe('the guards every mode shares', () => {
  it('refuses a bill of nothing', () => {
    const r = resolveSplit({ mode: 'equal', total: 0, participants: [P('you')] })
    expect(r.valid).toBe(false)
    expect(r.message).toMatch(/amount/i)
  })

  it('refuses a bill nobody is sharing', () => {
    const r = resolveSplit({
      mode: 'equal', total: 100, participants: [P('you', 0, false)],
    })
    expect(r.valid).toBe(false)
    expect(r.message).toMatch(/nobody/i)
  })
})

describe('the mode table', () => {
  /** A field labelled "%" feeding the shares branch is a bug nobody spots. */
  it('has a field shape for every mode that is offered', () => {
    const fields = /** @type {Record<string, any>} */ (MODE_FIELD)
    for (const m of SPLIT_MODES) expect(fields[m.value]).toBeTruthy()
    expect(Object.keys(MODE_FIELD).sort()).toEqual(SPLIT_MODES.map(m => m.value).sort())
  })
})

describe('resolveBillShares', () => {
  /**
   * The iCloud case: one charge a month, three people, different shares.
   * Stored as what was typed, so it divides THIS month's amount.
   */
  const bill = {
    name: 'iCloud', amount: 699, category: 'Bills',
    split: {
      mode: 'shares',
      you: { included: true, value: '2' },
      people: [{ name: 'Gelo', value: '1' }, { name: 'Mika', value: '1' }],
    },
  }

  it('divides the amount it is charging now, not the one it was set up with', () => {
    const at699 = resolveBillShares(bill, 699)
    expect(at699).toEqual([{ name: 'Gelo', amount: 174.75 }, { name: 'Mika', amount: 174.75 }])

    // Apple raises the price; nothing about the bill is re-entered.
    const at799 = resolveBillShares(bill, 799)
    expect(at799[0].amount).toBe(199.75)
  })

  it('is empty for a bill nobody shares, so the caller needs no branch', () => {
    expect(resolveBillShares({ name: 'Netflix', amount: 549 }, 549)).toEqual([])
    expect(resolveBillShares({ split: { mode: 'equal', people: [] } }, 549)).toEqual([])
  })

  it('leaves out anyone who ends up owing nothing', () => {
    const r = resolveBillShares({
      split: {
        mode: 'shares', you: { included: true, value: '1' },
        people: [{ name: 'Gelo', value: '1' }, { name: 'Nobody', value: '0' }],
      },
    }, 600)
    expect(r.map(p => p.name)).toEqual(['Gelo'])
  })

  it('leaves out a person with no name, rather than opening a nameless debt', () => {
    const r = resolveBillShares({
      split: { mode: 'equal', you: { included: true }, people: [{ name: '  ' }] },
    }, 600)
    expect(r).toEqual([])
  })

  it('refuses to divide nothing', () => {
    expect(resolveBillShares(bill, 0)).toEqual([])
  })
})
