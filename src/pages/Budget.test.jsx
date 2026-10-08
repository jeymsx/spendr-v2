// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * The Budget page's offer to keep last month's leftovers.
 *
 * Moving the money into a goal and dismissing the offer used to write the same
 * stamp, so a month whose leftovers had already been moved went on showing
 * "unspent last month, Keep it" - one tap from a second transfer of the same
 * money. What is pinned here is what each stamp shows: nothing yet decided,
 * the offer; dismissed, one quiet line; moved, nothing at all.
 *
 * The database is stood in for by the reads the page makes, over fixed rows,
 * and the page is mounted shallow as the smoke tests mount theirs.
 */

const now = new Date()
/** @param {number} back months back from this one @param {number} [day] */
const inMonth = (back, day = 10) => new Date(now.getFullYear(), now.getMonth() - back, day, 12).toISOString()

const CATEGORIES = [
  { id: 1, name: 'Groceries', type: 'expense', budget: 5000, color: '#10b981' },
  { id: 2, name: 'Salary', type: 'inflow', budget: 90000, color: '#2D9DFF' },
]
// Last month: 3,000 of Groceries' 5,000 spent, so 2,000 is left over.
const TXS = [
  { id: 1, type: 'expense', category: 'Groceries', amount: 3000, date: inMonth(1), account: 'Cash' },
  { id: 2, type: 'expense', category: 'Groceries', amount: 100, date: inMonth(0, 1), account: 'Cash' },
]
/** @type {{ rows: Array<Record<string, any>>, categories: Array<Record<string, any>>, txs: Array<Record<string, any>> }} */
const store = { rows: [], categories: CATEGORIES, txs: TXS }

vi.mock('../db/db', () => ({
  default: {
    categories: { toArray: async () => store.categories },
    transactions: { toArray: async () => store.txs },
    meta: { toArray: async () => store.rows, put: async () => {} },
    goals: { toArray: async () => [] },
    accounts: { toArray: async () => [] },
  },
  UNSYNCED: 0,
  SYNCED: 1,
  SYNCED_TABLES: [],
}))
vi.mock('../db/txHelpers', () => ({ postCardPayment: async () => {} }))
vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', accentColor: '#2D9DFF' }),
  useIsDark: () => false,
}))
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: () => {}, dismiss: () => {} }),
}))
vi.mock('../hooks/useLiveQuery', async () => {
  const { useEffect, useState } = await import('react')
  return {
    /** @param {() => Promise<any>} querier */
    useLiveQuery: (querier, _deps, initial) => {
      const [value, setValue] = useState(initial)
      // Read once, on mount: the rows here do not change while a test runs.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      useEffect(() => { querier().then(setValue) }, [])
      return value
    },
  }
})

const { default: Budget } = await import('./Budget')
const { sweptKey, prevMonth, monthKey } = await import('../lib/rollover')

const lastMonth = prevMonth(monthKey(now))
/** @param {unknown} [value] the stamp for last month, or none */
const stamp = (value) => (value === undefined ? [] : [{ key: sweptKey(lastMonth), value }])
const renderPage = () => render(<MemoryRouter><Budget /></MemoryRouter>)

beforeEach(() => { store.rows = []; store.categories = CATEGORIES; store.txs = TXS })
afterEach(cleanup)

describe('last month\'s leftovers', () => {
  it('offers them while nothing has been decided', async () => {
    store.rows = stamp()
    renderPage()
    expect(await screen.findByText(/You did not spend .* last month/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
    expect(screen.queryByText(/unspent last month/)).toBeNull()
  })

  /** One quiet line that still opens the sheet. */
  it('keeps one quiet line after a dismissal', async () => {
    store.rows = stamp('dismissed')
    renderPage()
    expect(await screen.findByText(/unspent last month/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Keep it/ })).toBeTruthy()
    expect(screen.queryByText(/You did not spend/)).toBeNull()
  })

  /** The bug: this line stayed, and a second tap moved the same money again. */
  it('shows nothing once the money has been moved', async () => {
    store.rows = stamp('moved')
    renderPage()
    await screen.findByText('By category')
    expect(screen.queryByText(/unspent last month/)).toBeNull()
    expect(screen.queryByText(/You did not spend/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Keep it/ })).toBeNull()
  })

  /** What the page wrote before the two were told apart, for both: read as moved. */
  it('reads an old stamp as moved, so it cannot offer the money twice', async () => {
    store.rows = stamp(true)
    renderPage()
    await screen.findByText('By category')
    expect(screen.queryByText(/unspent last month/)).toBeNull()
    expect(screen.queryByText(/You did not spend/)).toBeNull()
  })
})

describe('the empty state', () => {
  it('sends you to the limits themselves, not the settings index', async () => {
    store.categories = [{ id: 1, name: 'Groceries', type: 'expense', budget: 0 }]
    renderPage()
    const link = await screen.findByRole('link', { name: 'Set a budget' })
    expect(link.getAttribute('href')).toBe('/settings/budgets')
  })
})

describe('an inflow category that holds a budget', () => {
  /** The bug: its 90,000 was added to every total and listed beside the real limits. */
  it('is not a limit: it is not listed, and not counted', async () => {
    renderPage()
    await screen.findByText('By category')
    expect(screen.getByText('Groceries', { selector: 'p' })).toBeTruthy()
    expect(screen.queryByText('Salary')).toBeNull()
    // The month's limit is Groceries' 5,000 alone.
    expect(screen.getByText(/5,000.* limit/)).toBeTruthy()
  })

  it('leaves the empty state when it is the only budget there is', async () => {
    store.categories = [{ id: 2, name: 'Salary', type: 'inflow', budget: 90000 }]
    renderPage()
    expect(await screen.findByText('No budgets set')).toBeTruthy()
  })
})
