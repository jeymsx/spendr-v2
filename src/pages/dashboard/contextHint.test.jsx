// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The line under the greeting, and the Home budget card's empty state.
 *
 * The hint said "almost full" at 85% while the phone's meter went amber at 75%
 * and the bell warned at 80%; it read the bare limit rather than the one in
 * force with rollover carried in; and it counted an inflow category's stray
 * budget as a limit. All three are pinned here, on the budget branches that
 * come first. The rest of the hint depends on the clock and is not tested.
 */

vi.mock('../../db/db', () => ({ default: {}, UNSYNCED: 0, SYNCED: 1, SYNCED_TABLES: [] }))

const { getContextHint, shortAmount } = await import('./shared')
const { BudgetSummaryTile } = await import('./Tiles')
const { setBaseCurrency } = await import('../../lib/money')

afterEach(() => { cleanup(); setBaseCurrency('PHP') })

/** @param {string} name @param {number} budget @param {number} spent @param {Record<string, any>} [more] */
const row = (name, budget, spent, more = {}) => ({ name, type: 'expense', budget, spent, ...more })

describe('the budget hint under the greeting', () => {
  it('says over budget for a category past its limit', () => {
    expect(getContextHint([], [row('Food', 1000, 1200)], []).text).toBe('Over budget on food')
  })

  /** One line for every surface (lib/budgetLevels.js): 80%, as the bell has always warned. */
  it('says almost full from 80%, not from 85', () => {
    expect(getContextHint([], [row('Food', 1000, 800)], []).text).toBe('food budget almost full')
    expect(getContextHint([], [row('Food', 1000, 820)], []).text).toBe('food budget almost full')
  })

  it('says nothing about a budget below 80%, where the meter is not amber either', () => {
    for (const spent of [0, 750, 790]) {
      expect(getContextHint([], [row('Food', 1000, spent)], []).text, String(spent)).not.toMatch(/budget/)
    }
  })

  it('does not call a category at exactly its limit over it', () => {
    expect(getContextHint([], [row('Food', 1000, 1000)], []).text).toBe('food budget almost full')
  })

  /** The limit it is handed is the one in force: with 2,000 carried in, 1,200 spent is nowhere near over. */
  it('reads the carried-over limit it is given, not the base one', () => {
    const carried = row('Food', 3000, 1200, { baseBudget: 1000 })
    expect(getContextHint([], [carried], []).text).not.toMatch(/budget/)
  })

  /** The carried overspend that wiped the limit out is over as soon as anything is spent. */
  it('says over for a limit carried down to nothing with money spent', () => {
    expect(getContextHint([], [row('Food', 0, 50)], []).text).toBe('Over budget on food')
  })

  /** The bug: a "Monthly budget" on Salary counted as a limit. */
  it('ignores an inflow category that holds a budget', () => {
    const salary = row('Salary', 1000, 5000, { type: 'inflow' })
    expect(getContextHint([], [salary], []).text).not.toMatch(/budget/)
  })

  it('picks the first category that is over, before any that is only near', () => {
    const hint = getContextHint([], [row('Fun', 1000, 900), row('Food', 1000, 1100)], [])
    expect(hint.text).toBe('Over budget on food')
    expect(hint.cat.name).toBe('Food')
  })
})

/**
 * The "spent today" hint and the template chips each had a formatter of their
 * own that stopped at K, so a million read "₱1000.0K"; the chips also wrote
 * the ledger's mark on a template kept in another currency.
 */
describe('shortAmount, for the chips and the hint', () => {
  it('is whole below a thousand and the shared compact form above', () => {
    expect(shortAmount(940)).toBe('₱940')
    expect(shortAmount(1500)).toBe('₱1.5K')
    expect(shortAmount(5000)).toBe('₱5.0K')
  })

  it('goes past K, to M, B and T', () => {
    expect(shortAmount(2_500_000)).toBe('₱2.5M')
    expect(shortAmount(1_200_000_000)).toBe('₱1.2B')
    expect(shortAmount(3_000_000_000_000)).toBe('₱3.0T')
  })

  it("writes a template's own currency when given one", () => {
    expect(shortAmount(40, 'USD')).toBe('$40')
    expect(shortAmount(150000, 'JPY')).toBe('¥150.0K')
  })

  it('follows the ledger when given none', () => {
    setBaseCurrency('USD')
    expect(shortAmount(12.6)).toBe('$13')
  })

  it('says a big day in M rather than thousands of K', () => {
    const tx = { id: 1, type: 'expense', amount: 2_500_000, account: 'Cash', date: new Date().toISOString() }
    expect(getContextHint([tx], [], []).text).toBe('₱2.5M spent today')
    const small = { ...tx, amount: 450 }
    expect(getContextHint([small], [], []).text).toBe('₱450 spent today')
  })
})

describe('the Home budget card with no budget set', () => {
  const renderTile = () => render(
    <MemoryRouter><BudgetSummaryTile totals={{ budget: 0, spent: 0, pct: 0 }} /></MemoryRouter>)

  /** It went to the settings index, a list of a dozen other things. */
  it('goes straight to the budget limits', () => {
    renderTile()
    expect(screen.getByRole('link').getAttribute('href')).toBe('/settings/budgets')
  })

  it('says what to do in one short line', () => {
    renderTile()
    expect(screen.getByText('Set a monthly limit')).toBeTruthy()
    expect(screen.getByText(/for a category/)).toBeTruthy()
    expect(screen.queryByText(/in Settings/)).toBeNull()
  })
})
